import { useState } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Alert, Box, Button, Group, Text } from "metabase/ui";

import { useExecutePythonMutation, useCancelPythonMutation } from "../../../api/python-runner";

type PythonEditorProps = {
  script: string;
  isRunnable: boolean;
  onChange: (script: string) => void;
  tables?: Record<string, number>;
};

interface ExecutionResult {
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  if (!csv || !csv.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = csv.trim().split("\n");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    return line.split(",").map(cell => cell.trim());
  });

  return { headers, rows };
}

export function PythonEditor({
  script,
  isRunnable,
  onChange,
  tables = {},
}: PythonEditorProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executePython] = useExecutePythonMutation();
  const [cancelPython] = useCancelPythonMutation();
  const handleScriptChange = (newScript: string) => {
    onChange(newScript);
    // Don't clear results on every keystroke - keep them visible for reference
  };

  const handleRunScript = async () => {
    setIsRunning(true);
    setExecutionResult(null);

    try {
      const result = await executePython({
        code: script,
        tables: tables,
      }).unwrap();


      if (result?.body && result?.body.error) {
        setExecutionResult({
          error: result.body.error || "Execution failed",
          stdout: result.body.stdout,
          stderr: result.body.stderr,
        });
      } else {
        setExecutionResult({
          output: result.output,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }
    } catch (error: any) {

      // The API returns error data directly in error.data
      const errorData = error?.data || {};
      const errorMessage = errorData.error ||
                          error?.message ||
                          "Failed to execute Python script";
      const stdout = errorData.stdout || "";
      const stderr = errorData.stderr || "";

      setExecutionResult({
        error: errorMessage,
        stdout: stdout,
        stderr: stderr,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancelScript = async () => {
    try {
      await cancelPython().unwrap();
      setIsRunning(false);
      setExecutionResult({
        error: t`Python script execution was canceled`,
      });
    } catch (error) {
      console.error("Failed to cancel Python script:", error);
      // Still set running to false since the cancel might have worked on the server
      setIsRunning(false);
      setExecutionResult({
        error: t`Python script execution was canceled (cancel request may have failed)`,
      });
    }
  };

  const { headers, rows } = parseCSV(executionResult?.output || "");

  return (
    <Box h="100%" style={{ display: "flex", flexDirection: "column" }}>
      {/* Python Script Editor */}
      <Box style={{ height: "300px" }}>
        <CodeEditor
          value={script}
          onChange={handleScriptChange}
          language="python"
        />
      </Box>

      {/* Results Section - positioned between editor and buttons */}
      {(executionResult || isRunning) && (
        <Box mt="md">
          {isRunning ? (
            <Box p="md">
              <Text c="text-medium">{t`Running Python script...`}</Text>
            </Box>
          ) : executionResult?.error ? (
            <>
              <Box p="md">
                <Alert color="red" title={t`Execution Error`}>
                  {executionResult.error}
                </Alert>
              </Box>
              {executionResult.stdout && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stdout}
                  </Box>
                </Box>
              )}
              {executionResult.stderr && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stderr}
                  </Box>
                </Box>
              )}
            </>
          ) : !executionResult?.output || headers.length === 0 ? (
            <>
              <Box p="md">
                <Text c="text-medium">{t`No results to display.`}</Text>
              </Box>
              {executionResult?.stdout && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stdout}
                  </Box>
                </Box>
              )}
              {executionResult?.stderr && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stderr}
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <>
              {executionResult.stdout && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stdout}
                  </Box>
                </Box>
              )}
              {executionResult.stderr && (
                <Box mt="md" p="md" bg="bg-light" style={{ maxHeight: "150px", overflow: "auto" }}>
                  <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
                  <Box style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {executionResult.stderr}
                  </Box>
                </Box>
              )}
              <Box mt="md" style={{ maxHeight: "300px", overflow: "auto" }}>
                <Text fw="bold" mb="md">{t`Results Table:`}</Text>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ddd" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f0f0f0" }}>
                      {headers.map((header, index) => (
                        <th key={index} style={{ padding: "8px", textAlign: "left", borderBottom: "2px solid #ddd" }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} style={{ borderBottom: "1px solid #eee" }}>
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
            </>
          )}
        </Box>
      )}

      {/* Action Buttons */}
      <Box mt="md">
        <Group gap="sm">
          <Button
            variant="filled"
            leftSection={isRunning ? undefined : <span>▶</span>}
            onClick={isRunning ? handleCancelScript : handleRunScript}
            disabled={!isRunnable && !isRunning}
            loading={isRunning}
          >
            {isRunning ? t`Cancel` : t`Run Python Script`}
          </Button>
        </Group>
      </Box>
    </Box>
  );
}
