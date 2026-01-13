import { useCallback } from "react";
import { t } from "ttag";

import EmptyState from "metabase/common/components/EmptyState";
import { Stack, Text } from "metabase/ui";
import {
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTransformQuery,
} from "metabase-enterprise/api";
import type {
  ExternalTransform,
  Transform,
  WorkspaceId,
  WorkspaceTransform,
} from "metabase-types/api";

import { type EditedTransform, useWorkspace } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";
import { TransformListItemMenu } from "./TransformListItemMenu";

type CodeTabProps = {
  activeTransformId?: number | string;
  availableTransforms: ExternalTransform[];
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransform[];
  readOnly: boolean;
  onTransformClick: (
    transform: Transform | WorkspaceTransform | EditedTransform,
  ) => void;
};

export const CodeTab = ({
  activeTransformId,
  availableTransforms,
  workspaceId,
  workspaceTransforms,
  readOnly,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms, hasTransformEdits } = useWorkspace();

  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();
  const [fetchTransform] = useLazyGetTransformQuery();

  const normalizeTransformId = useCallback(
    (transform: Transform | WorkspaceTransform) =>
      "ref_id" in transform ? transform.ref_id : transform.id,
    [],
  );

  const handleTransformClick = useCallback(
    (transform: Transform | WorkspaceTransform) => {
      const transformId = normalizeTransformId(transform);
      const edited = editedTransforms.get(transformId);
      const transformToOpen =
        edited != null ? { ...transform, ...edited } : transform;

      onTransformClick(transformToOpen);
    },
    [editedTransforms, normalizeTransformId, onTransformClick],
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
        handleTransformClick(transform);
      }
    },
    [fetchTransform, handleTransformClick],
  );

  const handleWorkspaceTransformClick = useCallback(
    async (workspaceTransform: WorkspaceTransform) => {
      if (
        typeof workspaceTransform.id === "number" &&
        workspaceTransform.id < 0
      ) {
        return handleTransformClick(workspaceTransform);
      }

      const { data: transform } = await fetchWorkspaceTransform(
        {
          workspaceId,
          transformId: workspaceTransform.ref_id,
        },
        true,
      );

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
            const isActive =
              (typeof activeTransformId === "string" &&
                activeTransformId === transform.ref_id) ||
              (typeof activeTransformId === "number" &&
                activeTransformId === transform.global_id);

            return (
              <TransformListItem
                key={transform.ref_id ?? transform.id}
                name={transform.name}
                icon="pivot_table"
                fw={600}
                isActive={isActive}
                isEdited={isEdited}
                menu={
                  readOnly ? null : (
                    <TransformListItemMenu
                      transform={transform}
                      workspaceId={workspaceId}
                    />
                  )
                }
                onClick={() => {
                  handleWorkspaceTransformClick(transform);
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
        {availableTransforms.map((transform) => {
          const tooltipLabel =
            transform.checkout_disabled === "mbql"
              ? t`This transform cannot be edited in a workspace because it uses MBQL.`
              : transform.checkout_disabled === "card-reference"
                ? t`This transform cannot be edited in a workspace because it references other questions.`
                : transform.checkout_disabled
                  ? t`This transform cannot be edited in a workspace.`
                  : undefined;

          return (
            <TransformListItem
              key={transform.id}
              name={transform.name}
              isActive={activeTransformId === transform.id}
              isEdited={editedTransforms.has(transform.id)}
              onClick={() => {
                handleExternalTransformClick(transform);
              }}
              opacity={transform.checkout_disabled ? 0.5 : 1}
              tooltipLabel={tooltipLabel}
            />
          );
        })}
        {availableTransforms.length === 0 && (
          <EmptyState message={t`No available transforms`} />
        )}
      </Stack>
    </Stack>
  );
};
