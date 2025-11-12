import type { ReactNode } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import Link from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Box, Button, Checkbox, Flex, Icon, Stack, Tooltip } from "metabase/ui";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";

import { PythonEditor } from "../../PythonEditor";

import S from "./PythonEditorBody.module.css";
import { ResizableBoxHandle } from "./ResizableBoxHandle";
import { hasImport, insertImport, removeImport } from "./utils";

type PythonEditorBodyProps = {
  source: string;
  proposedSource?: string;
  isRunnable: boolean;
  onChange: (source: string) => void;
  onRun?: () => void;
  onCancel?: () => void;
  isRunning?: boolean;
  isDirty?: boolean;
  tables?: Record<string, number>;
  withDebugger?: boolean;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

const EDITOR_HEIGHT = 400;

export function PythonEditorBody({
  source,
  proposedSource,
  onChange,
  isRunnable,
  onRun,
  onCancel,
  isRunning,
  isDirty,
  withDebugger,
  onAcceptProposed,
  onRejectProposed,
}: PythonEditorBodyProps) {
  return (
    <MaybeResizableBox resizable={withDebugger}>
      <Flex h="100%" align="end" bg="background-secondary" pos="relative">
        <PythonEditor
          value={source}
          proposedValue={proposedSource}
          onChange={onChange}
          withPandasCompletions
          data-testid="python-editor"
        />

        <Stack m="1rem" gap="md" mt="auto">
          {proposedSource && onRejectProposed && onAcceptProposed && (
            <>
              <Tooltip label={t`Accept proposed changes`} position="left">
                <Button
                  data-testid="accept-proposed-changes-button"
                  variant="filled"
                  bg="success"
                  px="0"
                  w="2.5rem"
                  onClick={onAcceptProposed}
                >
                  <Icon name="check" />
                </Button>
              </Tooltip>
              <Tooltip label={t`Reject proposed changes`} position="left">
                <Button
                  data-testid="reject-proposed-changes-button"
                  w="2.5rem"
                  px="0"
                  variant="filled"
                  bg="danger"
                  onClick={onRejectProposed}
                >
                  <Icon name="close" />
                </Button>
              </Tooltip>
            </>
          )}
          {withDebugger && (
            <Box p="md">
              <RunButtonWithTooltip
                disabled={!isRunnable}
                isRunning={isRunning}
                isDirty={isDirty}
                onRun={onRun}
                onCancel={onCancel}
                getTooltip={() => t`Run Python script`}
              />
            </Box>
          )}
        </Stack>
        <SharedLibraryActions source={source} onChange={onChange} />
      </Flex>
    </MaybeResizableBox>
  );
}

function MaybeResizableBox({
  resizable,
  children,
}: {
  resizable?: boolean;
  children?: ReactNode;
}) {
  if (!resizable) {
    return <Box h="100%">{children}</Box>;
  }

  return (
    <ResizableBox
      axis="y"
      height={EDITOR_HEIGHT}
      handle={<ResizableBoxHandle />}
      resizeHandles={["s"]}
    >
      {children}
    </ResizableBox>
  );
}

function SharedLibraryActions({
  source,
  onChange,
}: {
  source: string;
  onChange: (source: string) => void;
}) {
  return (
    <Stack className={S.libraryActions} p="md" gap="sm">
      <SharedLibraryImportToggle source={source} onChange={onChange} />
      <SharedLibraryEditLink />
    </Stack>
  );
}

function SharedLibraryImportToggle({
  source,
  onChange,
}: {
  source: string;
  onChange: (source: string) => void;
}) {
  const hasSharedLib = hasImport(source, SHARED_LIB_IMPORT_PATH);

  function handleToggleSharedLib() {
    if (hasImport(source, SHARED_LIB_IMPORT_PATH)) {
      onChange(removeImport(source, SHARED_LIB_IMPORT_PATH));
    } else {
      onChange(insertImport(source, SHARED_LIB_IMPORT_PATH));
    }
  }

  return (
    <Checkbox
      label={t`Import common library`}
      checked={hasSharedLib}
      onChange={handleToggleSharedLib}
      size="sm"
    />
  );
}

function SharedLibraryEditLink() {
  return (
    <Flex
      component={Link}
      target="_blank"
      to={Urls.transformPythonLibrary({ path: SHARED_LIB_IMPORT_PATH })}
      gap="sm"
    >
      <Icon name="pencil" />
      {t`Edit common library`}
    </Flex>
  );
}
