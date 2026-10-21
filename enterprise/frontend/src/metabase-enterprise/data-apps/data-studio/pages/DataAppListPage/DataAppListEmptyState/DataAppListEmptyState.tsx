import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { Link } from "metabase/common/components/Link";
import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { Button, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetDataAppRepoStatusQuery } from "metabase-enterprise/api";

import { INSTALL_SKILL_COMMAND } from "../../../../constants";

export function DataAppListEmptyState() {
  const { data: repoStatus } = useGetDataAppRepoStatusQuery();
  const isRepoConfigured = repoStatus?.configured ?? false;

  return (
    <FeatureEmptyState
      title={t`Apps built on your semantic layer`}
      description={
        isRepoConfigured
          ? t`Data apps are custom React apps your AI agent builds with the data apps skill. They live in your Git repository, read the tables and metrics in your semantic layer, and change data only through data actions. Install the skill in your project, then ask your AI agent to create a data app.`
          : t`Data apps are custom React apps your AI agent builds with the data apps skill. They live in your Git repository, read the tables and metrics in your semantic layer, and change data only through data actions. Connect a repository, then install the skill in your project and ask your AI agent to create a data app.`
      }
      actions={
        isRepoConfigured ? (
          <CopyTextArea
            value={INSTALL_SKILL_COMMAND}
            aria-label={t`Install command`}
            autosize
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
          />
        ) : (
          <Group gap="sm">
            <Button
              variant="filled"
              component={Link}
              to={Urls.adminRemoteSyncSettings()}
            >{t`Set up Git sync`}</Button>
          </Group>
        )
      }
      features={[
        {
          icon: "ai",
          title: t`Built by your AI agent`,
          description: t`Describe the app; the skill writes it`,
        },
        {
          icon: "git_branch",
          title: t`Version control`,
          description: t`Apps live in data_apps/ in your repository`,
        },
        {
          icon: "repository",
          title: t`Your semantic layer`,
          description: t`Reads the tables and metrics you publish`,
        },
        {
          icon: "bolt",
          title: t`Data actions`,
          description: t`Writes go through actions you define`,
        },
      ]}
    />
  );
}
