import type { ReactNode } from "react";
import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";

type WorkspaceDetailsSectionProps = {
  workspace: WorkspaceInstance;
  databaseCount: number;
};

export function WorkspaceDetailsSection({
  workspace,
  databaseCount,
}: WorkspaceDetailsSectionProps) {
  return (
    <TitleSection
      label={t`Workspace`}
      description={t`The active workspace configuration on this Metabase instance.`}
    >
      <Stack p="lg" gap="md">
        <DetailRow
          label={t`Name`}
          value={<Text fw="bold">{workspace.name}</Text>}
        />
        <DetailRow label={t`Databases`} value={<Text>{databaseCount}</Text>} />
        <DetailRow
          label={t`Table remappings`}
          value={<Text>{workspace.remappings_count}</Text>}
        />
      </Stack>
    </TitleSection>
  );
}

type DetailRowProps = {
  label: string;
  value: ReactNode;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Group wrap="nowrap" gap="md" align="baseline">
      <Text c="text-secondary" w="10rem" flex="0 0 auto">
        {label}
      </Text>
      {value}
    </Group>
  );
}
