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

import { TransformTargetDiff } from "./TransformTargetDiff";

type DiffViewProps = {
  transform: WorkspaceTransformListItem;
  workspaceId: WorkspaceId;
};

export const DiffView = ({ transform, workspaceId }: DiffViewProps) => {
  const { oldSource, newSource, oldTarget, newTarget, isLoading, hasError } =
    useTransformSources(workspaceId, transform);

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
        <Text c="text-medium">{t`Loading diff...`}</Text>
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

  return (
    <Stack gap={0} h="100%">
      {oldTarget && newTarget && targetChanged && (
        <Stack
          px="md"
          py="sm"
          style={{
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <TransformTargetDiff newTarget={newTarget} oldTarget={oldTarget} />
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
