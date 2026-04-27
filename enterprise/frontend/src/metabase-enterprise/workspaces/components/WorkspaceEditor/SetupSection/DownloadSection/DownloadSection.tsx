import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import { downloadFromUrl } from "metabase/utils/dom";

import type { WorkspaceInfo } from "../../../../types";

type DownloadSectionProps = {
  workspace: WorkspaceInfo;
};

export function DownloadSection({ workspace }: DownloadSectionProps) {
  return (
    <Group p="md" gap="sm" wrap="nowrap">
      <DownloadConfigButton workspace={workspace} />
      <DownloadMetadataButton />
      <DownloadFieldValuesButton />
    </Group>
  );
}

function DownloadConfigButton({ workspace }: DownloadSectionProps) {
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
