import { t } from "ttag";

import { Box, Button, Code, Divider, Group, Icon } from "metabase/ui";
import { downloadFromUrl } from "metabase/utils/dom";

import { DOCKER_RUN_COMMAND } from "../../../constants";
import type { WorkspaceInfo } from "../../../types";
import { TitleSection } from "../../TitleSection";

type SetupSectionProps = {
  workspace: WorkspaceInfo;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  if (workspace.id == null) {
    return null;
  }

  return (
    <TitleSection
      label={t`Setup development instance`}
      description={t`Export the config to set up a new development instance. Include the table metadata to skip its initial database sync.`}
    >
      <Group p="md" gap="sm" wrap="nowrap">
        <DownloadConfigButton workspace={workspace} />
        <DownloadMetadataButton />
        <DownloadFieldValuesButton />
      </Group>
      <Divider />
      <Box p="md" pb="0">
        {t`After downloading the files, run the following command to start a development instance with the exported configuration:`}
      </Box>
      <Code block p="md" m="md" mt="sm">
        {DOCKER_RUN_COMMAND}
      </Code>
    </TitleSection>
  );
}

function DownloadConfigButton({ workspace }: SetupSectionProps) {
  const handleDownload = () => {
    downloadFromUrl(
      `/api/ee/workspace/${workspace.id}/config/yaml`,
      "config.yml",
    );
  };

  return (
    <Button
      variant="filled"
      leftSection={<Icon name="gear" />}
      onClick={handleDownload}
    >
      {t`Download config file`}
    </Button>
  );
}

function DownloadMetadataButton() {
  const handleDownload = () => {
    downloadFromUrl("/api/database/metadata", "metadata.json");
  };

  return (
    <Button leftSection={<Icon name="database" />} onClick={handleDownload}>
      {t`Download table metadata`}
    </Button>
  );
}

function DownloadFieldValuesButton() {
  const handleDownload = () => {
    downloadFromUrl("/api/database/field-values", "field_values.json");
  };

  return (
    <Button leftSection={<Icon name="list" />} onClick={handleDownload}>
      {t`Download field values`}
    </Button>
  );
}
