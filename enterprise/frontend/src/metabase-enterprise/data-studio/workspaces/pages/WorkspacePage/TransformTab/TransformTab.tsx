import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Text } from "metabase/ui";
import type {
  DatabaseId,
  TaggedTransform,
  WorkspaceId,
  WorkspaceTransform,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";
import { useActiveTransform } from "../useActiveTransform";

import { TransformTabContent } from "./TransformTabContent";

interface Props {
  databaseId: DatabaseId;
  disabled: boolean;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformListItem[];
  onSaveTransform: (transform: TaggedTransform | WorkspaceTransform) => void;
}

export function TransformTab({
  databaseId,
  disabled,
  workspaceId,
  workspaceTransforms,
  onSaveTransform,
}: Props) {
  const { activeTransformRef, activeEditedTransform, unsavedTransforms } =
    useWorkspace();

  const {
    data: activeTransform,
    error: activeTransformError,
    isLoading: activeTransformIsLoading,
  } = useActiveTransform({
    transformRef: activeTransformRef,
    unsavedTransforms,
    workspaceId: workspaceId,
  });

  if (activeTransformError || activeTransformIsLoading) {
    return (
      <LoadingAndErrorWrapper
        error={activeTransformError}
        loading={activeTransformIsLoading}
      />
    );
  }

  if (!activeEditedTransform || !activeTransform) {
    return (
      <Text c="text-secondary">{t`Select a transform on the right.`}</Text>
    );
  }

  return (
    <TransformTabContent
      databaseId={databaseId}
      disabled={disabled}
      transform={activeTransform}
      workspaceId={workspaceId}
      workspaceTransforms={workspaceTransforms}
      onSaveTransform={onSaveTransform}
    />
  );
}
