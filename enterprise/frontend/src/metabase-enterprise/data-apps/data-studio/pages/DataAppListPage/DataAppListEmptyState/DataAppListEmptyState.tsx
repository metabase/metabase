import { t } from "ttag";

import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";

export function DataAppListEmptyState() {
  return (
    <FeatureEmptyState
      title={t`Apps built on your semantic layer`}
      description={t`Use the mb CLI to create a data app. Deploy it to your production instance with Remote Sync.`}
      actions={null}
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
