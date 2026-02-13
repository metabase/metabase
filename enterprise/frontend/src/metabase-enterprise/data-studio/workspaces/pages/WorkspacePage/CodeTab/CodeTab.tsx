import { useCallback } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Flex, Skeleton, Stack, Text } from "metabase/ui";
import { useGetExternalTransformsQuery } from "metabase-enterprise/api";
import { getCheckoutDisabledMessage } from "metabase-enterprise/data-studio/workspaces/utils";
import type {
  DatabaseId,
  ExternalTransform,
  UnsavedTransform,
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";
import { isUnsavedTransform } from "metabase-types/api";

import {
  type AnyWorkspaceTransformRef,
  useWorkspace,
} from "../WorkspaceProvider";

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
  databaseId: DatabaseId | null | undefined;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformItem[];
  isLoadingWorkspaceTransforms?: boolean;
  readOnly: boolean;
  onTransformClick: (transformRef: AnyWorkspaceTransformRef) => void;
};

export const CodeTab = ({
  activeTransformId,
  databaseId,
  workspaceId,
  workspaceTransforms,
  isLoadingWorkspaceTransforms,
  readOnly,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms } = useWorkspace();

  const {
    data: availableTransforms,
    error,
    isLoading,
  } = useGetExternalTransformsQuery(
    databaseId ? { workspaceId, databaseId } : skipToken,
  );

  const handleExternalTransformClick = useCallback(
    async (externalTransform: ExternalTransform) => {
      if (externalTransform.checkout_disabled) {
        return;
      }

      onTransformClick({
        type: "transform",
        id: externalTransform.id,
        name: externalTransform.name,
      });
    },
    [onTransformClick],
  );

  const handleWorkspaceTransformItemClick = useCallback(
    async (item: WorkspaceTransformItem) => {
      if (isUnsavedTransform(item)) {
        onTransformClick({
          type: "unsaved-transform",
          id: item.id,
          name: item.name,
        });
      } else {
        onTransformClick({
          type: "workspace-transform",
          ref_id: item.ref_id,
          name: item.name,
        });
      }
    },
    [onTransformClick],
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
          {isLoadingWorkspaceTransforms ? (
            <LoadingSkeleton />
          ) : (
            workspaceTransforms.map((item) => {
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
            })
          )}
        </Stack>

        {!isLoadingWorkspaceTransforms && workspaceTransforms.length === 0 && (
          <EmptyState message={t`Workspace is empty`} />
        )}
      </Stack>

      <Stack data-testid="mainland-transforms" py="sm" gap="xs">
        <Text fw={600} mt="sm">{t`Available transforms`}</Text>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <Text c="error" size="sm">{t`Failed to load transforms`}</Text>
        ) : (
          <>
            {availableTransforms?.map((transform) => (
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

            {availableTransforms?.length === 0 && (
              <EmptyState message={t`No available transforms`} />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};

function LoadingSkeleton() {
  return (
    <Stack data-testid="loading-indicator" gap="md" py="sm">
      <TransformListItemSkeleton />
      <TransformListItemSkeleton />
      <TransformListItemSkeleton />
    </Stack>
  );
}

function TransformListItemSkeleton() {
  return (
    <Flex align="center" gap="sm" px="md">
      <Skeleton h={14} w={14} circle />
      <Skeleton h={14} w="70%" />
    </Flex>
  );
}
