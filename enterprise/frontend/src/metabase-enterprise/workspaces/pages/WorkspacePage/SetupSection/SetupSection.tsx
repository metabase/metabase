import { Link } from "react-router";
import { jt, t } from "ttag";

import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { Button, Code, Group, Icon, Stack, Text } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

const CONFIG_FILENAME = "config.yml";

export type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  return (
    <TitleSection label={t`How to set up a development instance`}>
      <Stack p="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text maw="40rem">
            {
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
              jt`Run a local Metabase instance backed by this workspace's data so you can make changes safely. Pass this ${<Code key="config">{CONFIG_FILENAME}</Code>} file, containing the database credentials, when starting the instance.`
            }
          </Text>
          <Button
            component={Link}
            to={`/api/ee/workspace-manager/${workspace.id}/config`}
            leftSection={<Icon name="download" />}
          >
            {t`Download ${CONFIG_FILENAME}`}
          </Button>
        </Group>
      </Stack>
    </TitleSection>
  );
}
