export function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  if (!csv || !csv.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = csv.trim().split("\n");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    return line.split(",").map((cell) => cell.trim());
  });

  return { headers, rows };
}
