import { useMemo } from "react";
import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";

type CodeTabProps = {
  workspaceTransforms: Transform[];
  transforms: Transform[];
  activeTransformId?: number;
  onTransformClick: (transform: Transform) => void;
};

export const CodeTab = ({
  workspaceTransforms,
  transforms,
  activeTransformId,
  onTransformClick,
}: CodeTabProps) => {
  const { editedTransforms } = useWorkspace();
  const availableTransforms = useMemo(() => {
    return transforms.filter((transform) => {
      return !workspaceTransforms.some((t) => t.id === transform.id);
    });
  }, [workspaceTransforms, transforms]);

  return (
    <Stack h="100%" gap={0}>
      {workspaceTransforms.length > 0 && (
        <Stack
          gap="xs"
          pb="sm"
          style={{
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <Stack gap={0}>
            <Text fw={600}>{t`Workspace Transforms`}</Text>
            {workspaceTransforms.map((transform) => (
              <TransformListItem
                key={transform.id}
                name={transform.name}
                icon="pivot_table"
                fw={600}
                isActive={activeTransformId === transform.id}
                isEdited={editedTransforms.has(transform.id)}
                onClick={() => onTransformClick(transform)}
              />
            ))}
          </Stack>
        </Stack>
      )}
      <Stack py="sm" gap="xs">
        {availableTransforms.map((transform) => (
          <TransformListItem
            key={transform.id}
            name={transform.name}
            isActive={activeTransformId === transform.id}
            isEdited={editedTransforms.has(transform.id)}
            onClick={() => onTransformClick(transform)}
          />
        ))}
      </Stack>
    </Stack>
  );
};
