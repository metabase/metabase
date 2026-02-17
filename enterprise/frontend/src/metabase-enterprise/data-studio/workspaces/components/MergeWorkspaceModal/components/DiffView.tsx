import { unifiedMergeView } from "@codemirror/merge";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import EditorS from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css";
import { Flex, Loader, Stack, Text } from "metabase/ui";
import type {
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import S from "../MergeWorkspaceModal.module.css";
import { useTransformSources } from "../hooks/useTransformSources";
import { areSourceTablesEqual } from "../utils";

import { TableDiff } from "./TableDiff";
import { TransformSourceTablesDiff } from "./TransformSourceTablesDiff";

type DiffViewProps = {
  transform: WorkspaceTransformListItem;
  workspaceId: WorkspaceId;
};

export const DiffView = ({ transform, workspaceId }: DiffViewProps) => {
  const {
    oldSource,
    oldSourceTables,
    oldTarget,
    newSource,
    newSourceTables,
    newTarget,
    isLoading,
    hasError,
  } = useTransformSources(workspaceId, transform);

  const extensions = useMemo(
    () =>
      _.compact([
        oldSource &&
          unifiedMergeView({
            original: oldSource,
            mergeControls: false,
          }),
      ]),
    [oldSource],
  );

  if (isLoading) {
    return (
      <Flex
        align="center"
        justify="center"
        h="100%"
        direction="column"
        gap="sm"
      >
        <Loader size="sm" />
        <Text c="text-secondary">{t`Loading diff...`}</Text>
      </Flex>
    );
  }

  if (hasError) {
    return (
      <Flex align="center" justify="center" h="100%">
        <Text c="danger">{t`Failed to load diff`}</Text>
      </Flex>
    );
  }

  const schemaChanged = oldTarget?.schema !== newTarget?.schema;
  const tableChanged = oldTarget?.name !== newTarget?.name;
  const targetChanged = schemaChanged || tableChanged;
  const sourceTablesChanged = !areSourceTablesEqual(
    oldSourceTables,
    newSourceTables,
  );

  return (
    <Stack gap={0} h="100%">
      {oldTarget && newTarget && targetChanged && (
        <Stack
          data-testid="transform-target-diff"
          gap="xs"
          px="md"
          py="sm"
          style={{
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <Text component="label" fw="bold">{t`Transform target`}</Text>
          <TableDiff
            newSchema={newTarget.schema}
            newTable={newTarget.name}
            oldSchema={oldTarget.schema}
            oldTable={oldTarget.name}
          />
        </Stack>
      )}

      {oldSourceTables && newSourceTables && sourceTablesChanged && (
        <Stack
          data-testid="source-tables-diff"
          gap="xs"
          px="md"
          py="sm"
          style={{
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <Text component="label" fw="bold">{t`Source tables`}</Text>
          <TransformSourceTablesDiff
            newSourceTables={newSourceTables}
            oldSourceTables={oldSourceTables}
          />
        </Stack>
      )}

      <CodeMirror
        className={cx(EditorS.editor, S.diffEditor)}
        extensions={extensions}
        value={newSource}
        readOnly
        autoCorrect="off"
      />
    </Stack>
  );
};
