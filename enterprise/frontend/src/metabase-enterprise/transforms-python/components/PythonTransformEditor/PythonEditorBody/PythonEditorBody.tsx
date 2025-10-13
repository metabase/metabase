import type { ReactNode } from "react";
import { ResizableBox } from "react-resizable";
import { t } from "ttag";

import Link from "metabase/common/components/Link";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Box, Checkbox, Flex, Icon, Stack } from "metabase/ui";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";
import { getPythonLibraryUrl } from "metabase-enterprise/transforms-python/urls";

import { PythonEditor } from "../../PythonEditor";

import S from "./PythonEditorBody.module.css";
import { ResizableBoxHandle } from "./ResizableBoxHandle";
import { hasImport, insertImport, removeImport } from "./utils";

type PythonEditorBodyProps = {
  source: string;
  isRunnable: boolean;
  onChange: (source: string) => void;
  onRun?: () => void;
  onCancel?: () => void;
  isRunning?: boolean;
  isDirty?: boolean;
  tables?: Record<string, number>;
  withDebugger?: boolean;
};

const EDITOR_HEIGHT = 400;

export function PythonEditorBody({
  source,
  onChange,
  isRunnable,
  onRun,
  onCancel,
  isRunning,
  isDirty,
  withDebugger,
}: PythonEditorBodyProps) {
  return (
    <MaybeResizableBox resizable={withDebugger}>
      <Flex h="100%" align="end" bg="bg-light" pos="relative">
        <PythonEditor
          value={source}
          onChange={onChange}
          withPandasCompletions
          data-testid="python-editor"
        />

        {withDebugger && (
          <Stack p="md" gap="xs">
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={isDirty}
              onRun={onRun}
              onCancel={onCancel}
              getTooltip={() => t`Run Python script`}
            />
          </Stack>
        )}
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
      to={getPythonLibraryUrl({ path: SHARED_LIB_IMPORT_PATH })}
      gap="sm"
    >
      <Icon name="pencil" />
      {t`Edit common library`}
    </Flex>
  );
}
