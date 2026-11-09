import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { RunStatus } from "metabase/transforms/components/RunStatus";
import { Anchor, Group } from "metabase/ui";
import type { DataTestRun } from "metabase-types/api";

import { getRunStatusInfo } from "../../utils";

type DataTestRunSectionProps = {
  lastRun: DataTestRun | null;
  description: string;
  runsUrl: string;
  runButton: ReactNode;
};

export function DataTestRunSection({
  lastRun,
  description,
  runsUrl,
  runButton,
}: DataTestRunSectionProps) {
  return (
    <TitleSection label={t`Run this test`} description={description}>
      <Group p="xl" justify="space-between">
        <RunStatus
          run={getRunStatusInfo(lastRun)}
          neverRunMessage={t`This test hasn't been run before.`}
          runInfo={
            <Anchor component={Link} to={runsUrl} lh="inherit">
              {t`See all runs`}
            </Anchor>
          }
        />
        {runButton}
      </Group>
    </TitleSection>
  );
}
