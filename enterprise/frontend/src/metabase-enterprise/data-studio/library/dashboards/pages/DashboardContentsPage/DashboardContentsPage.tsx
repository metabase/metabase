import { useMemo } from "react";
import { t } from "ttag";

import type { Dashboard } from "metabase-types/api";

import {
  type ContentOwner,
  ContentsTable,
} from "../../../components/ContentsTable";
import { DashboardPageShell } from "../../components/DashboardPageShell";
import { getDashcardCards } from "../../utils";

import { getDashboardContentItems } from "./utils";

export function DashboardContentsPage() {
  return (
    <DashboardPageShell data-testid="dashboard-contents-page">
      {(dashboard) => <DashboardContents dashboard={dashboard} />}
    </DashboardPageShell>
  );
}

type DashboardContentsProps = {
  dashboard: Dashboard;
};

function DashboardContents({ dashboard }: DashboardContentsProps) {
  const items = useMemo(
    () => getDashboardContentItems(getDashcardCards(dashboard)),
    [dashboard],
  );
  const owner = useMemo<ContentOwner>(
    () => ({ model: "dashboard", id: dashboard.id, name: dashboard.name }),
    [dashboard.id, dashboard.name],
  );

  return (
    <ContentsTable
      items={items}
      owner={owner}
      emptyMessage={t`This dashboard has no questions yet`}
    />
  );
}
