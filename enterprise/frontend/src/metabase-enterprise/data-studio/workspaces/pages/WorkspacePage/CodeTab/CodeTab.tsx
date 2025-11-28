import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import type { WorkspaceTransform } from "../WorkspaceProvider";

import { TransformListItem } from "./TransformListItem";

type CodeTabProps = {
  workspaceTransforms: Transform[];
  transforms: Transform[];
  activeTransform?: WorkspaceTransform;
  onTransformClick: (transform: WorkspaceTransform) => void;
};

export const CodeTab = ({
  workspaceTransforms,
  transforms,
  activeTransform,
  onTransformClick,
}: CodeTabProps) => {
  const handleTransformClick = (transform: Transform) => {
    const workspaceTransform: WorkspaceTransform = {
      id: transform.id as number,
      name: transform.name as string,
      source: transform.source,
    };
    onTransformClick(workspaceTransform);
  };

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
                isActive={activeTransform?.id === transform.id}
                onClick={() => handleTransformClick(transform)}
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
            isActive={activeTransform?.id === transform.id}
            onClick={() => handleTransformClick(transform)}
          />
        ))}
      </Stack>
    </Stack>
  );
};
