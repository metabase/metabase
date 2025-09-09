import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { color } from "metabase/lib/colors";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Alert, Box, Flex, Stack, Text } from "metabase/ui";

import {
  useCancelPythonMutation,
  useExecutePythonMutation,
} from "../../../api/python-runner";
import { ResizableBoxHandle } from "../EditorBody/ResizableBoxHandle";

import S from "./PythonEditor.module.css";
import { parseCSV } from "./utils";

type PythonEditorProps = {
  script: string;
  isRunnable: boolean;
  isRunning?: boolean;
  isResultDirty?: boolean;
  onChange: (script: string) => void;
  onRunScript?: () => Promise<void>;
  onCancelScript?: () => void;
  tables?: Record<string, number>;
};

interface ExecutionResult {
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

const EDITOR_HEIGHT = 400;

export function PythonEditor({
  script,
  isRunnable,
  isRunning: isRunningProp,
  isResultDirty: _isResultDirty,
  onChange,
  onRunScript,
  onCancelScript,
  tables = {},
}: PythonEditorProps) {
  const [localIsRunning, setLocalIsRunning] = useState(false);
  const isRunning =
    isRunningProp !== undefined ? isRunningProp : localIsRunning;
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);
  const [executePython] = useExecutePythonMutation();
  const [cancelPython] = useCancelPythonMutation();
  const handleScriptChange = (newScript: string) => {
    onChange(newScript);
    // Don't clear results on every keystroke - keep them visible for reference
  };

  const handleRunScript = async () => {
    if (onRunScript) {
      await onRunScript();
      return;
    }
    setLocalIsRunning(true);
    setExecutionResult(null);

    try {
      const result = await executePython({
        code: script,
        tables: tables,
      }).unwrap();

      setExecutionResult({
        output: result.output,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error: any) {
      // The API returns error data directly in error.data
      const errorData = error?.data || {};
      const errorMessage = error?.message || "Failed to execute Python script";
      const stdout = errorData.stdout || "";
      const stderr = errorData.stderr || "";

      setExecutionResult({
        error: errorMessage,
        stdout: stdout,
        stderr: stderr,
      });
    } finally {
      setLocalIsRunning(false);
    }
  };

  const handleCancelScript = async () => {
    if (onCancelScript) {
      onCancelScript();
      return;
    }
    try {
      await cancelPython().unwrap();
      setLocalIsRunning(false);
      setExecutionResult({
        error: t`Python script execution was canceled`,
      });
    } catch (error) {
      console.error("Failed to cancel Python script:", error);
      // Still set running to false since the cancel might have worked on the server
      setLocalIsRunning(false);
      setExecutionResult({
        error: t`Python script execution was canceled (cancel request may have failed)`,
      });
    }
  };

  return (
    <Stack h="100%" w="100%" gap={0}>
      <ResizableBox
        className={S.root}
        axis="y"
        height={EDITOR_HEIGHT}
        handle={<ResizableBoxHandle />}
        resizeHandles={["s"]}
      >
        <Flex h="100%" align="end" bg="bg-light">
          <CodeEditor
            className={S.editor}
            value={script}
            onChange={handleScriptChange}
            language="python"
          />

          <Box p="md">
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={_isResultDirty}
              onRun={handleRunScript}
              onCancel={handleCancelScript}
              getTooltip={() => t`Run Python script`}
            />
          </Box>
        </Flex>
      </ResizableBox>

      <Box p="md">
        {isRunning && (
          <Box p="md">
            <Text c="text-medium">{t`Running Python script...`}</Text>
          </Box>
        )}
        {!isRunning && <ExecutionResult executionResult={executionResult} />}
      </Box>
    </Stack>
  );
}

function ExecutionResult({
  executionResult,
}: {
  executionResult: ExecutionResult | null;
}) {
  const { headers, rows } = parseCSV(executionResult?.output || "");

  if (!executionResult) {
    return null;
  }

  if (executionResult.error) {
    return (
      <>
        <Box p="md">
          <Alert color="red" title={t`Execution Error`}>
            {executionResult.error}
          </Alert>
        </Box>
        {executionResult.stdout && (
          <Box
            mt="md"
            p="md"
            bg="bg-light"
            style={{ maxHeight: "150px", overflow: "auto" }}
          >
            <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
            <Box
              style={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {executionResult.stdout}
            </Box>
          </Box>
        )}
        {executionResult.stderr && (
          <Box
            mt="md"
            p="md"
            bg="bg-light"
            style={{ maxHeight: "150px", overflow: "auto" }}
          >
            <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
            <Box
              style={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {executionResult.stderr}
            </Box>
          </Box>
        )}
      </>
    );
  }

  if (!executionResult?.output || headers.length === 0) {
    return (
      <>
        <Box p="md">
          <Text c="text-medium">{t`No results to display.`}</Text>
        </Box>
        {executionResult?.stdout && (
          <Box
            mt="md"
            p="md"
            bg="bg-light"
            style={{ maxHeight: "150px", overflow: "auto" }}
          >
            <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
            <Box
              style={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {executionResult.stdout}
            </Box>
          </Box>
        )}
        {executionResult?.stderr && (
          <Box
            mt="md"
            p="md"
            bg="bg-light"
            style={{ maxHeight: "150px", overflow: "auto" }}
          >
            <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
            <Box
              style={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {executionResult.stderr}
            </Box>
          </Box>
        )}
      </>
    );
  }

  return (
    <>
      {executionResult.stdout && (
        <Box
          mt="md"
          p="md"
          bg="bg-light"
          style={{ maxHeight: "150px", overflow: "auto" }}
        >
          <Text fw="bold" mb="xs">{t`Standard Output:`}</Text>
          <Box
            style={{
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {executionResult.stdout}
          </Box>
        </Box>
      )}
      {executionResult.stderr && (
        <Box
          mt="md"
          p="md"
          bg="bg-light"
          style={{ maxHeight: "150px", overflow: "auto" }}
        >
          <Text fw="bold" mb="xs">{t`Standard Error:`}</Text>
          <Box
            style={{
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {executionResult.stderr}
          </Box>
        </Box>
      )}
      <Box mt="md" style={{ maxHeight: "300px", overflow: "auto" }}>
        <Text fw="bold" mb="md">{t`Results Table:`}</Text>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: `1px solid ${color("border")}`,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: color("bg-medium") }}>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: `2px solid ${color("border")}`,
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
                style={{
                  borderBottom: `1px solid ${color("border")}`,
                }}
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
    </>
  );
}
