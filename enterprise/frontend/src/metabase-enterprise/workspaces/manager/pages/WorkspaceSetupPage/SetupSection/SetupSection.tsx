import { jt, t } from "ttag";

import { Button, Code, Stack, Text } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace } from "metabase-types/api";

const CONFIG_FILE_NAME = "config.yml";

type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  return (
    <TitleSection
      label={t`Set up a development instance`}
      description={t`Run a local instance backed by this workspace's data, so you can iterate on changes safely.`}
    >
      <DownloadConfigSection workspace={workspace} />
    </TitleSection>
  );
}

type DownloadConfigSectionProps = {
  workspace: Workspace;
};

function DownloadConfigSection({ workspace }: DownloadConfigSectionProps) {
  const configUrl = `/api/ee/workspace-manager/${workspace.id}/config`;

  return (
    <Stack p="md" gap="sm" align="flex-start">
      <Text>
        {jt`Pass this ${<Code key="cfg">{CONFIG_FILE_NAME}</Code>}, containing the database credentials, when starting the instance.`}
      </Text>
      <Button component="a" href={configUrl} download="config.yml">
        {t`Download config.yml`}
      </Button>
    </Stack>
  );
}
