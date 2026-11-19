import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { ActionBreadcrumbs } from "metabase/data-studio/actions/components/ActionBreadcrumbs";
import * as Urls from "metabase/urls";
import type { ActionTest, WritebackAction } from "metabase-types/api";

type ActionTestHeaderProps = {
  action: WritebackAction;
  test: ActionTest;
};

function isRunsPathname(pathname: string) {
  return pathname.endsWith("/runs");
}

export function ActionTestHeader({ action, test }: ActionTestHeaderProps) {
  const overviewUrl = Urls.dataStudioActionTest(action.id, test.id);
  const runsUrl = Urls.dataStudioActionTestRuns(action.id, test.id);
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: overviewUrl,
      isSelected: (pathname: string) => !isRunsPathname(pathname),
    },
    {
      label: t`Runs`,
      to: runsUrl,
      isSelected: isRunsPathname,
    },
  ];

  return (
    <PaneHeader
      title={<PanelHeaderTitle>{test.name}</PanelHeaderTitle>}
      icon="test_tube"
      tabs={<PillTabNavigation tabs={tabs} />}
      breadcrumbs={
        <ActionBreadcrumbs action={action}>
          <Link to={Urls.dataStudioActionTestList(action.id)}>
            {action.name}
          </Link>
          {test.name}
        </ActionBreadcrumbs>
      }
      data-testid="action-test-header"
    />
  );
}
