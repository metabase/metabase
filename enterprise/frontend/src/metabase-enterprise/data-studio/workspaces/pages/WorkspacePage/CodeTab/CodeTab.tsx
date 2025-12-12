import { useCallback } from "react";
import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { Stack, Text } from "metabase/ui";
import { useLazyGetWorkspaceTransformQuery } from "metabase-enterprise/api";
import type {
  ExternalTransform,
  Transform,
  WorkspaceId,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";
import { TransformListItemMenu } from "./TransformListItemMenu";

type CodeTabProps = {
  activeTransformId?: number;
  availableTransforms: ExternalTransform[];
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  onTransformClick: (transform: ExternalTransform) => void;
};

export const CodeTab = ({
  activeTransformId,
  availableTransforms,
  workspaceId,
  workspaceTransforms,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms, hasTransformEdits } = useWorkspace();

  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();

  const handleTransformClick = useCallback(
    (externalTransform: ExternalTransform) => {
      const edited = editedTransforms.get(externalTransform.id);
      // we need to fetch a transform
      const transformToOpen = edited
        ? { ...externalTransform, ...edited }
        : externalTransform;

      onTransformClick(transformToOpen);
    },
    [editedTransforms, onTransformClick],
  );

  const handleWorkspaceTransformClick = useCallback(
    async (workspaceTransform: WorkspaceTransformItem | Transform) => {
      if ("id" in workspaceTransform && workspaceTransform.id <= 0) {
        return handleTransformClick(workspaceTransform);
      }

      if (!("ref_id" in workspaceTransform)) {
        return;
      }

      const { data: transform } = await fetchWorkspaceTransform({
        workspaceId,
        transformId: workspaceTransform.ref_id,
      });
      if (transform) {
        handleTransformClick(transform);
      }
    },
    [fetchWorkspaceTransform, workspaceId, handleTransformClick],
  );

  return (
    <Stack h="100%" gap={0}>
      <Stack
        data-testid="workspace-transforms"
        gap="xs"
        pb="sm"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
        }}
      >
        <Stack gap={0}>
          <Text fw={600}>{t`Workspace transforms`}</Text>
          {workspaceTransforms.map((transform) => {
            const isEdited = hasTransformEdits(transform);

            return (
              <TransformListItem
                key={transform.ref_id}
                name={transform.name}
                icon="pivot_table"
                fw={600}
                isActive={activeTransformId === transform.id}
                isEdited={isEdited}
                menu={
                  <TransformListItemMenu
                    transform={transform}
                    workspaceId={workspaceId}
                  />
                }
                onClick={() => handleWorkspaceTransformClick(transform)}
              />
            );
          })}
        </Stack>

        {workspaceTransforms.length === 0 && (
          <EmptyState message={t`Workspace is empty`} />
        )}
      </Stack>

      <Stack data-testid="mainland-transforms" py="sm" gap="xs">
        <Text fw={600} mt="sm">{t`Available transforms`}</Text>
        {availableTransforms.map((transform) => (
          <TransformListItem
            key={transform.id}
            name={transform.name}
            isActive={activeTransformId === transform.id}
            isEdited={editedTransforms.has(transform.id)}
            onClick={() => handleTransformClick(transform)}
          />
        ))}
      </Stack>
    </Stack>
  );
};
