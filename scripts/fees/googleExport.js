const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(process.cwd(), './keys/credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TRACKER_SPREADSHEET_ID = '1F7m1lB77SJze0MvLZNHfWYGk4PRNL6d81HmFxkcI05M';
const TRACKER_PAGE = 'Fee Distribution Daily Tracker';

async function getColumnValues(auth, range) {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: TRACKER_SPREADSHEET_ID,
    range, // e.g. "Sheet1!A:A"
  });

  return res.data.values || [];
}

function findTopmostEmptyRow(values) {
  for (let i = 0; i < values.length; i++) {
    if (!values[i] || values[i].length === 0 || values[i][0] === '') {
      return i + 1; // Sheets is 1-based index
    }
  }

  return values.length + 1;
}

async function findTopEmptyCell(auth) {
  const values = await getColumnValues(auth, `${TRACKER_PAGE}!A4:A`);

  const row = findTopmostEmptyRow(values);

  return `A${row}`;
}

async function writeToSheet(values) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: SCOPES,
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const emptyRow = await findTopEmptyCell(authClient);
    const range = `${TRACKER_PAGE}!${emptyRow}`;

    const resource = {
      values,
    };

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: TRACKER_SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED', // How input data is interpreted (USER_ENTERED or RAW)
      resource,
    });

    console.log(`${result.data.updates.updatedCells} cells updated.`);
    console.log('Data written successfully to the Google Sheet.');

  } catch (err) {
    console.error('Error writing to Google Sheets API:', err);
  }
}

// writeToSheet([['A', 'B'], ['C', 'D']])

module.exports = { writeToSheet };
