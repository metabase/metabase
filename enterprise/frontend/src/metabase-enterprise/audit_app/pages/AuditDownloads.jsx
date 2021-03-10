import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";
import AuditTable from "../containers/AuditTable";

import * as DownloadsCards from "../lib/cards/downloads";

type Props = {
  params: { [key: string]: string },
};

const AuditDownloads = (props: Props) => (
  <AuditContent {...props} title="Downloads" tabs={AuditDownloads.tabs} />
);

const AuditDownloadsOverviewTab = () => (
  <AuditDashboard
    cards={[
      [{ x: 0, y: 0, w: 18, h: 9 }, DownloadsCards.perDayBySize()],
      [{ x: 0, y: 9, w: 6, h: 9 }, DownloadsCards.perUser()],
      [{ x: 6, y: 9, w: 12, h: 9 }, DownloadsCards.bySize()],
    ]}
  />
);

const AuditDownloadsAllTab = () => (
  <AuditTable table={DownloadsCards.table()} />
);

AuditDownloads.tabs = [
  { path: "overview", title: "Overview", component: AuditDownloadsOverviewTab },
  { path: "all", title: "All downloads", component: AuditDownloadsAllTab },
];

export default AuditDownloads;
