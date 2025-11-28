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

  return (
    <Stack h="100%">
      {workspaceTransforms.length > 0 && (
        <Stack
          gap="xs"
          style={{
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <Stack gap={0}>
            <Text fw={600}>{t`Workspace Transforms`}</Text>
            {workspaceTransforms.map((transform) => (
              <TransformListItem
                key={transform.id}
                name={transform.name as string}
                isActive={activeTransformId === transform.id}
                isEdited={editedTransforms.has(transform.id as number)}
                onClick={() => onTransformClick(transform)}
              />
            ))}
          </Stack>
        </Stack>
      )}
      <Stack py="md" gap="xs">
        {transforms.map((transform) => (
          <TransformListItem
            key={transform.id}
            name={transform.name as string}
            isActive={activeTransformId === transform.id}
            isEdited={editedTransforms.has(transform.id as number)}
            onClick={() => onTransformClick(transform)}
          />
        ))}
      </Stack>
    </Stack>
  );
};
