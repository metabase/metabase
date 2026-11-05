import { t } from "ttag";

import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";

import { DataAppBuildSteps } from "../DataAppBuildGuide";

export function DataAppListEmptyState() {
  return (
    <FeatureEmptyState
      title={t`Apps built on your semantic layer`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Data Studio is only for admins.
      description={t`Have your AI agent build a data app with the Metabase CLI. The app lives in your Git repository, and reaches each Metabase that syncs with it when you pull the changes.`}
      actions={<DataAppBuildSteps />}
      features={[
        {
          icon: "ai",
          title: t`Built by your AI agent`,
          description: t`Describe the app; your agent writes it`,
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
