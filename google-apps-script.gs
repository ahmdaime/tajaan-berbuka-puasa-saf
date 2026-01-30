// ============================================================
// GOOGLE APPS SCRIPT - Sistem Tempahan Berbuka Puasa
// ============================================================
// ARAHAN:
// 1. Buka Google Sheet anda
// 2. Extensions > Apps Script
// 3. Padam semua kod sedia ada dan tampal kod ini
// 4. Klik Deploy > Manage Deployments > Edit (ikon pensel)
//    - Tukar Version kepada "New version"
//    - Klik Deploy
// 5. URL kekal sama, tidak perlu tukar dalam HTML
// ============================================================

const SHEET_NAME = 'Tempahan';
const RECEIPT_FOLDER_NAME = 'Resit_Berbuka_Puasa_2026';

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(RECEIPT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(RECEIPT_FOLDER_NAME);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Tarikh Tajaan', 'Menu', 'Harga (RM)', 'Nama Penaja',
      'No Telefon', 'Emel', 'Catatan', 'Status Bayaran',
      'Nama Resit', 'Link Resit', 'Tarikh Hantar'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  return sheet;
}

// Normalize tarikh kepada string DD/MM/YYYY
// Google Sheets mungkin simpan sebagai Date object atau string
function normalizeDateStr(value) {
  if (!value) return '';

  // Jika ia Date object
  if (value instanceof Date) {
    const d = value.getDate().toString().padStart(2, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const y = value.getFullYear();
    return d + '/' + m + '/' + y;
  }

  // Jika string, kembalikan terus
  return value.toString().trim();
}

// GET - ambil tarikh yang sudah ditempah
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getBookedDates') {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const dates = [];

    for (let i = 1; i < data.length; i++) {
      const status = (data[i][7] || '').toString().trim();
      if (status === 'Menunggu Pengesahan' || status === 'Disahkan') {
        const dateVal = normalizeDateStr(data[i][0]);
        if (dateVal) {
          dates.push(dateVal);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      dates: dates
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Unknown action'
  })).setMimeType(ContentService.MimeType.JSON);
}

// POST - simpan tempahan baru
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet();

    // Semak duplikasi tarikh (normalize untuk perbandingan)
    const incomingDate = (data.tarikh_tajaan || '').toString().trim();
    const existingData = sheet.getDataRange().getValues();

    for (let i = 1; i < existingData.length; i++) {
      const existingDate = normalizeDateStr(existingData[i][0]);
      if (existingDate === incomingDate) {
        const status = (existingData[i][7] || '').toString().trim();
        if (status === 'Menunggu Pengesahan' || status === 'Disahkan') {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'duplicate',
            message: 'Tarikh ini telah ditempah.'
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // Simpan resit ke Google Drive jika ada
    let receiptUrl = '';
    if (data.resit_data && data.resit_nama) {
      try {
        const folder = getOrCreateFolder();
        const blob = Utilities.newBlob(
          Utilities.base64Decode(data.resit_data),
          data.resit_type || 'application/octet-stream',
          data.resit_nama
        );
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        receiptUrl = file.getUrl();
      } catch (uploadErr) {
        console.error('Gagal muat naik resit:', uploadErr);
      }
    }

    // Tambah baris baru dalam Google Sheet
    sheet.appendRow([
      data.tarikh_tajaan,
      data.menu_dipilih,
      data.harga,
      data.nama_penaja,
      data.no_telefon,
      data.emel,
      data.catatan || '',
      data.status_bayaran,
      data.resit_nama || '',
      receiptUrl,
      data.created_at
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Tempahan berjaya disimpan.'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('Error:', err);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
