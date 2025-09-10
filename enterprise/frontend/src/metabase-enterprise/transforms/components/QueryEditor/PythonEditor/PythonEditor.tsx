import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import Alert from "metabase/common/components/Alert";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import { isMac } from "metabase/lib/browser";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Box, Flex, Stack, Text } from "metabase/ui";

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

      <DebouncedFrame className={S.visualization}>
        {match({ isRunning, executionResult })
          .with({ isRunning: true }, () => <LoadingState />)
          .with({ executionResult: null }, () => <EmptyState />)
          .otherwise(() => (
            <ExecutionResult executionResult={executionResult} />
          ))}
      </DebouncedFrame>
    </Stack>
  );
}

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + return` : t`Ctrl + enter`;
}

function LoadingState() {
  return <Text c="text-medium">{t`Running Python script...`}</Text>;
}

function EmptyState() {
  const keyboardShortcut = getRunQueryShortcut();

  return (
    <Flex h="100%" align="center" justify="center">
      <Stack maw="25rem" gap={0} ta="center" align="center">
        <Box maw="3rem" mb="0.75rem">
          <img src={EmptyCodeResult} alt="Code prompt icon" />
        </Box>
        <Text c="text-medium">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
      </Stack>
    </Flex>
  );
}

function ExecutionResult({
  executionResult,
}: {
  executionResult: ExecutionResult | null;
}) {
  if (!executionResult) {
    return null;
  }

  const message = getMessageForExecutionResult(executionResult);

  return (
    <>
      {message}

      <ExecutionLogs
        label={t`Standard Output:`}
        content={executionResult.stdout}
      />
      <ExecutionLogs
        label={t`Standard Error:`}
        content={executionResult.stderr}
      />

      <ExecutionOutput output={executionResult.output} />
    </>
  );
}

function getMessageForExecutionResult(executionResult: ExecutionResult) {
  if (executionResult.error) {
    return (
      <Alert variant="error">
        <Text fw="bold">{t`Execution Error`}</Text>
        {executionResult.error}
      </Alert>
    );
  }
  if (!executionResult.output) {
    return (
      <Box p="md">
        <Text c="text-medium">{t`No results to display.`}</Text>
      </Box>
    );
  }
  return null;
}

function ExecutionLogs({
  label,
  content,
}: {
  label: string;
  content?: string | null;
}) {
  if (!content) {
    return null;
  }

  return (
    <Box p="md" bg="bg-light" mah="150px">
      <Text fw="bold" mb="xs">
        {label}
      </Text>
      <Text className={S.output}>{content}</Text>
    </Box>
  );
}

function ExecutionOutput({ output }: { output?: string }) {
  const { headers, rows } = parseCSV(output || "");

  if (!output || headers.length === 0) {
    return null;
  }

  return (
    <Box p="md">
      <Text fw="bold" mb="xs">{t`Results:`}</Text>
      <table className={S.results}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index} className={S.tableHeader}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={S.tableCell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
