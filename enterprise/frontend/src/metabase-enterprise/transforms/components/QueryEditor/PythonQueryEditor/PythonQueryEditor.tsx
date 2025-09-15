import type { ReactNode } from "react";
import { ResizableBox } from "react-resizable";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import Link from "metabase/common/components/Link";
import { LoadingSpinner } from "metabase/common/components/MetadataInfo/MetadataInfo.styled";
import { isMac } from "metabase/lib/browser";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Box, Checkbox, Flex, Icon, Stack, Text, Title } from "metabase/ui";
import { getPythonLibraryUrl } from "metabase-enterprise/transforms/urls";

import { SHARED_LIB_IMPORT_PATH } from "../../../constants";
import { PythonEditor as PythonCodeEditor } from "../../PythonEditor";
import { ResizableBoxHandle } from "../EditorBody/ResizableBoxHandle";

import { ExecutionOutputTable } from "./ExecutionOutputTable";
import S from "./PythonQueryEditor.module.css";
import {
  type ExecutionResult,
  hasImport,
  insertImport,
  removeImport,
  useTestPythonScript,
} from "./utils";

type PythonEditorProps = {
  script: string;
  isRunnable: boolean;
  onChange: (script: string) => void;
  onRunScript?: () => Promise<void>;
  onCancelScript?: () => void;
  tables?: Record<string, number>;
};

const EDITOR_HEIGHT = 400;

export function PythonQueryEditor({
  script,
  isRunnable,
  onChange,
  tables = {},
}: PythonEditorProps) {
  const { isRunning, isDirty, cancel, run, executionResult } =
    useTestPythonScript(script, tables);

  const hasSharedLib = hasImport(script, SHARED_LIB_IMPORT_PATH);
  function handleToggleSharedLib() {
    if (hasImport(script, SHARED_LIB_IMPORT_PATH)) {
      onChange(removeImport(script, SHARED_LIB_IMPORT_PATH));
    } else {
      onChange(insertImport(script, SHARED_LIB_IMPORT_PATH));
    }
  }

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
          <PythonCodeEditor
            value={script}
            onChange={onChange}
            withPandasCompletions
          />

          <Box p="md">
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={isDirty}
              onRun={run}
              onCancel={cancel}
              getTooltip={() => t`Run Python script`}
            />
          </Box>
        </Flex>
        <Stack className={S.libraryActions} p="md" gap="sm">
          <Checkbox
            label={t`Import common library`}
            checked={hasSharedLib}
            onChange={handleToggleSharedLib}
            size="sm"
          />
          <Flex
            component={Link}
            target="_blank"
            to={getPythonLibraryUrl({ path: SHARED_LIB_IMPORT_PATH })}
            gap="sm"
          >
            <Icon name="pencil" />
            {t`Edit common library`}
          </Flex>
        </Stack>
      </ResizableBox>

      <DebouncedFrame className={S.visualization}>
        {executionResult ? (
          <ExecutionResult executionResult={executionResult} />
        ) : (
          <EmptyState />
        )}
        {isRunning && <LoadingState />}
      </DebouncedFrame>
    </Stack>
  );
}

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + return` : t`Ctrl + enter`;
}

function LoadingState() {
  return (
    <Flex p="md" className={S.loading}>
      <LoadingSpinner />
    </Flex>
  );
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
    <Stack gap={0}>
      {message}

      <ExecutionLogs
        label={t`Standard output:`}
        content={executionResult.stdout}
      />
      <ExecutionLogs
        label={t`Standard error:`}
        content={executionResult.stderr}
      />

      <ExecutionOutputTable output={executionResult.output} />
    </Stack>
  );
}

function getMessageForExecutionResult(executionResult: ExecutionResult) {
  if (executionResult.error) {
    return (
      <Box className={S.error} p="sm">
        <Flex gap="sm">
          <Icon name="warning" />
          <Stack gap={0}>
            <Title order={5} mb="xs">
              {t`An error occurred while executing your Python script`}
            </Title>
            {executionResult.error}
          </Stack>
        </Flex>
      </Box>
    );
  }

  if (!executionResult.output) {
    return (
      <Flex className={S.info} p="sm" bdrs="xs" gap="sm" align="center">
        <Icon name="info" />
        {t`No results to display.`}
      </Flex>
    );
  }

  return (
    <Flex className={S.success} p="sm" gap="sm" align="center">
      <Icon name="check" />
      {t`Script executed successfully.`}
    </Flex>
  );
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
    <Section title={label}>
      <Box p="sm" bg="bg-light" mah="150px" bdrs="xs" className={S.logs}>
        {content}
      </Box>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      {title && (
        <Title order={5} mb="xs">
          {title}
        </Title>
      )}
      {children}
    </Box>
  );
}
