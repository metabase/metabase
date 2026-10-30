import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { RunStatus } from "metabase/transforms/components/RunStatus";
import { Anchor, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformTest } from "metabase-types/api";

import { TransformTestRunButton } from "../../../components/TransformTestRunButton";
import { getRunStatusInfo } from "../../../utils";

type TransformTestRunSectionProps = {
  test: TransformTest;
  readOnly: boolean;
};

export function TransformTestRunSection({
  test,
  readOnly,
}: TransformTestRunSectionProps) {
  return (
    <TitleSection
      label={t`Run this test`}
      description={t`Runs the transform on the test data and checks its output. The real tables aren't touched.`}
    >
      <Group p="xl" justify="space-between">
        <RunStatus
          run={getRunStatusInfo(test.last_run)}
          neverRunMessage={t`This test hasn't been run before.`}
          runInfo={
            <Anchor
              component={Link}
              to={Urls.transformTestRuns(test.transform_id, test.id)}
              lh="inherit"
            >
              {t`See all runs`}
            </Anchor>
          }
        />
        <TransformTestRunButton
          test={test}
          readOnly={readOnly}
          triggeredFrom="test_overview"
        />
      </Group>
    </TitleSection>
  );
}
