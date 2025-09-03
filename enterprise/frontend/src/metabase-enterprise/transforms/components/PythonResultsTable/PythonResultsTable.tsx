import { useMemo } from "react";
import { t } from "ttag";

import { colors } from "metabase/lib/colors/colors";
import { Alert, Box, Text } from "metabase/ui";

interface PythonResultsTableProps {
  csvData?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
  isLoading?: boolean;
}

function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  if (!csv || !csv.trim()) {
    return { headers: [], rows: [] };
  }

  // Split by newlines to get rows
  const lines = csv.trim().split("\n");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse headers from first line
  const headers = lines[0].split(",").map((h) => h.trim());

  // Parse data rows
  const rows = lines.slice(1).map((line) => {
    // Simple CSV parsing - handles basic comma-separated values
    // For more complex CSV (with quotes, escapes), we'd need a proper parser
    return line.split(",").map((cell) => cell.trim());
  });

  return { headers, rows };
}

export function PythonResultsTable({
  csvData,
  error,
  stdout,
  stderr,
  isLoading = false,
}: PythonResultsTableProps) {
  const { headers, rows } = useMemo(() => {
    if (!csvData) {
      return { headers: [], rows: [] };
    }
    const parsed = parseCSV(csvData);
    return parsed;
  }, [csvData]);

  if (isLoading) {
    return (
      <Box p="lg">
        <Text c="text-medium">{t`Running Python script...`}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="lg">
        <Alert color="red" title={t`Execution Error`} mb="md">
          {error}
        </Alert>
        {stdout && (
          <Box mb="md">
            <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
            <Box
              p="sm"
              bg="bg-light"
              style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
            >
              {stdout}
            </Box>
          </Box>
        )}
        {stderr && (
          <Box>
            <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
            <Box
              p="sm"
              bg="bg-light"
              style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
            >
              {stderr}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  if (!csvData || headers.length === 0) {
    return (
      <Box p="lg">
        <Text c="text-medium">{t`No results to display. Click "Run" to execute the script.`}</Text>
        {stdout && (
          <Box mt="md">
            <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
            <Box
              p="sm"
              bg="bg-light"
              style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
            >
              {stdout}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box
      style={{
        overflow: "auto",
        padding: "1rem",
        background: colors["bg-light"],
        border: `1px solid ${colors["border"]}`,
      }}
    >
      {stdout && (
        <Box p="md" pb={0}>
          <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
          <Box
            p="sm"
            bg="bg-light"
            style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
            mb="md"
          >
            {stdout}
          </Box>
        </Box>
      )}
      <Box style={{ background: "white", padding: "1rem" }}>
        <Text fw="bold" mb="md">{t`Results Table:`}</Text>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: `1px solid ${colors["border"]}`,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: colors["bg-medium"] }}>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: `2px solid ${colors["border"]}`,
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                style={{ borderBottom: `1px solid ${colors["bg-medium"]}` }}
              >
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} style={{ padding: "8px" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
