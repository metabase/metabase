import { useCallback } from "react";
import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { Stack, Text } from "metabase/ui";
import {
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTransformQuery,
} from "metabase-enterprise/api";
import { getCheckoutDisabledMessage } from "metabase-enterprise/data-studio/workspaces/utils";
import type {
  ExternalTransform,
  TaggedTransform,
  UnsavedTransform,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform } from "metabase-types/api";

import { getTransformId, useWorkspace } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";
import { TransformListItemMenu } from "./TransformListItemMenu";

/** Item that can be displayed in the workspace transforms list */
type WorkspaceTransformItem = UnsavedTransform | WorkspaceTransformListItem;

function getWorkspaceTransformItemId(
  item: WorkspaceTransformItem,
): string | number {
  if (isUnsavedTransform(item)) {
    return item.id;
  }
  return item.ref_id;
}

type CodeTabProps = {
  activeTransformId?: number | string;
  availableTransforms: ExternalTransform[];
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  readOnly: boolean;
  onTransformClick: (transform: TaggedTransform | WorkspaceTransform) => void;
};

export const CodeTab = ({
  activeTransformId,
  availableTransforms,
  workspaceId,
  workspaceTransforms,
  readOnly,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms } = useWorkspace();

  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();
  const [fetchTransform] = useLazyGetTransformQuery();

  const handleFullTransformClick = useCallback(
    (transform: TaggedTransform | WorkspaceTransform) => {
      const transformId = getTransformId(transform);
      const edited = editedTransforms.get(transformId);
      // Cast is safe because we're just merging edited fields into the transform
      const transformToOpen = (
        edited != null ? { ...transform, ...edited } : transform
      ) as TaggedTransform | WorkspaceTransform;

      onTransformClick(transformToOpen);
    },
    [editedTransforms, onTransformClick],
  );

  const handleExternalTransformClick = useCallback(
    async (externalTransform: ExternalTransform) => {
      if (externalTransform.checkout_disabled) {
        return;
      }

      const { data: transform } = await fetchTransform(
        externalTransform.id,
        true,
      );

      if (transform) {
        const taggedTransform: TaggedTransform = {
          ...transform,
          type: "transform",
        };
        handleFullTransformClick(taggedTransform);
      }
    },
    [fetchTransform, handleFullTransformClick],
  );

  const handleWorkspaceTransformItemClick = useCallback(
    async (item: WorkspaceTransformItem) => {
      // Unsaved transforms are stored locally.
      // They should open directly without API fetch.
      if (isUnsavedTransform(item)) {
        // Unsaved transforms should already be opened via the provider
        // This path shouldn't normally be hit, but if it is, we can't
        // call onTransformClick because we don't have a full transform
        return;
      }

      const { data: transform } = await fetchWorkspaceTransform(
        {
          workspaceId,
          transformId: item.ref_id,
        },
        true,
      );

      if (transform) {
        handleFullTransformClick(transform);
      }
    },
    [fetchWorkspaceTransform, workspaceId, handleFullTransformClick],
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
          {workspaceTransforms.map((item) => {
            const itemId = getWorkspaceTransformItemId(item);
            const isUnsaved = isUnsavedTransform(item);
            const globalId = isUnsaved ? null : item.global_id;
            const isEdited = isUnsaved || editedTransforms.has(itemId);
            const isActive =
              activeTransformId === itemId || activeTransformId === globalId;

            return (
              <TransformListItem
                key={itemId}
                name={item.name}
                icon="pivot_table"
                fw={600}
                isActive={isActive}
                isEdited={isEdited}
                menu={
                  readOnly ? null : (
                    <TransformListItemMenu
                      transform={item}
                      workspaceId={workspaceId}
                    />
                  )
                }
                onClick={() => {
                  handleWorkspaceTransformItemClick(item);
                }}
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
            onClick={() => {
              handleExternalTransformClick(transform);
            }}
            opacity={transform.checkout_disabled ? 0.5 : 1}
            tooltipLabel={getCheckoutDisabledMessage(
              transform.checkout_disabled,
            )}
          />
        ))}
        {availableTransforms.length === 0 && (
          <EmptyState message={t`No available transforms`} />
        )}
      </Stack>
    </Stack>
  );
};
