import { jt, t } from "ttag";

import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { Button, Code, FixedSizeIcon, Group, Text, Tooltip } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";

const CONFIG_FILENAME = "config.yml";

export type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
  const description = jt`Run a local Metabase instance backed by this workspace's data so you can make changes safely. Pass this ${<Code key="config">{CONFIG_FILENAME}</Code>} file, containing the database credentials, when starting the instance.`;
  const isDisabled = workspace.databases.length === 0;

  return (
    <TitleSection
      data-testid="workspace-setup-section"
      label={t`How to set up a development instance`}
    >
      <Group p="lg" justify="space-between" align="center">
        <Text maw="40rem">{description}</Text>
        {isDisabled ? (
          <Tooltip label={t`You need to add at least one database.`}>
            <Button
              disabled
              leftSection={<FixedSizeIcon name="download" aria-hidden />}
            >
              {t`Download ${CONFIG_FILENAME}`}
            </Button>
          </Tooltip>
        ) : (
          <Button
            component="a"
            href={`/api/ee/workspace-manager/${workspace.id}/config`}
            download={CONFIG_FILENAME}
            onClick={() =>
              trackWorkspaceConfigDownloaded({ workspaceId: workspace.id })
            }
            leftSection={<FixedSizeIcon name="download" aria-hidden />}
          >
            {t`Download ${CONFIG_FILENAME}`}
          </Button>
        )}
      </Group>
    </TitleSection>
  );
}
