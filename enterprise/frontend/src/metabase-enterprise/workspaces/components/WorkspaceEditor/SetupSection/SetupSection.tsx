import { t } from "ttag";

import { Divider } from "metabase/ui";

import type { WorkspaceInfo } from "../../../types";
import { TitleSection } from "../../TitleSection";

import { CredentialsSection } from "./CredentialsSection";
import { DockerRunSection } from "./DockerRunSection";
import { DownloadSection } from "./DownloadSection";

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
      <DownloadSection workspace={workspace} />
      <Divider />
      <DockerRunSection />
      <Divider />
      <CredentialsSection />
    </TitleSection>
  );
}
