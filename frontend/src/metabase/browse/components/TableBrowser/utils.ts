type CsvData = Record<string, number | string>[];

type ColumnDef = Record<string, "int" | "float" | "string">;

const getColumnNames = row =>
  Object.keys(row).map((key, idx) => key || `col_${idx}`);

export function detectSchema(data: CsvData) {
  console.time("schema detection");
  const columns: ColumnDef = Object.fromEntries(
    getColumnNames(data[0]).map((key, idx) => [key, "int"]),
  );

  Object.keys(data[0]).forEach(key => {
    for (let row = 0; row < data.length; row++) {
      const value = data[row][key];

      if (typeof value === "string") {
        columns[key] = "string";
        break; // if we find any string for this key, we don't have to check any more
      }

      if (
        typeof value === "number" &&
        !Number.isInteger(value) &&
        columns[key] === "int"
      ) {
        columns[key] = "float";
      }
    }
  });
  console.timeEnd("schema detection");

  return columns;
}

export function formatInsertData(data: CsvData) {
  console.time("formatting data");
  // do Object.keys and Object.values guarantee stable ordering?
  const columns = getColumnNames(data[0]);
  const rows = data.map((row: any) => {
    return Object.values(row);
  });
  console.timeEnd("formatting data");
  return { columns, rows };
}
