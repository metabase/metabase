import { useMemo } from "react";
import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { Stack, Text } from "metabase/ui";
import type { Transform, WorkspaceId } from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";
import { TransformListItemMenu } from "./TransformListItemMenu";

type CodeTabProps = {
  activeTransformId?: number;
  transforms: Transform[];
  workspaceId: WorkspaceId;
  workspaceTransforms: Transform[];
  onTransformClick: (transform: Transform) => void;
};

export const CodeTab = ({
  activeTransformId,
  transforms,
  workspaceId,
  workspaceTransforms,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms, hasTransformEdits } = useWorkspace();

  const workspaceTransformsUpstreamIds = useMemo(
    () => new Set(workspaceTransforms.map((t) => t.upstream_id)),
    [workspaceTransforms],
  );
  const availableTransforms = useMemo(() => {
    return transforms.filter((transform) => {
      return !workspaceTransformsUpstreamIds.has(transform.id);
    });
  }, [workspaceTransformsUpstreamIds, transforms]);

  const handleTransformClick = (transform: Transform) => {
    const edited = editedTransforms.get(transform.id);
    const transformToOpen = edited
      ? ({ ...transform, ...edited } as Transform)
      : transform;
    onTransformClick(transformToOpen);
  };

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
                key={transform.id}
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
                onClick={() => handleTransformClick(transform)}
              />
            );
          })}
        </Stack>

        {workspaceTransforms.length === 0 && (
          <EmptyState message={t`Workspace is empty`} />
        )}
      </Stack>

      <Stack data-testid="mainland-transforms" py="sm" gap="xs">
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
