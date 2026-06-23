/**
 * jsonData must be in the format:
 * [
 *   { column1: value1, column2: value2, ... },
 *   { column1: value3, column2: value4, ... },
 *   ...
 * ]
 */
function jsonToCsvFormData(jsonData) {
  const formData = new FormData();
  const csvHeader = Object.keys(jsonData[0]).join(',') + '\n';
  const csvContent = jsonData.map(row =>
    Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csvHeader + csvContent], { type: 'text/csv' });
  formData.append('file', blob, 'data.csv');

  return formData;
}

async function uploadCsvToMb({ baseUrl, tableId, jsonData, mode = 'append' }) {
  const formData = jsonToCsvFormData(jsonData);
  const operation = mode === 'replace' ? 'replace-csv' : 'append-csv';

  const response = await fetch(`${baseUrl}/api/table/${tableId}/${operation}`, {
    method: 'POST',
    headers: {
      "x-api-key": process.env.API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed: ${response.status} ${response.statusText} ${body}`.trim());
  }
  return { success: true };
}

module.exports = { uploadCsvToMb };
