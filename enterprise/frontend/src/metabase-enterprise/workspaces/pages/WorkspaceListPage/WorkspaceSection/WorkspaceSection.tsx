import { t } from "ttag";

import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { Stack } from "metabase/ui";
import type { Workspace } from "metabase-types/api/workspace";

import { WorkspaceItem } from "./WorkspaceItem";

type WorkspaceSectionProps = {
  workspaces: Workspace[];
};

export function WorkspaceSection({ workspaces }: WorkspaceSectionProps) {
  return (
    <TitleSection
      label={t`Workspaces`}
      description={t`Workspaces isolate transformed tables into a separate schema so you can build and test changes before syncing them back to production.`}
    >
      <Stack>
        {workspaces.map((workspace) => (
          <WorkspaceItem key={workspace.id} workspace={workspace} />
        ))}
      </Stack>
    </TitleSection>
  );
}
