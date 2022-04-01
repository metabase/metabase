import React from "react";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, RecentView } from "metabase-types/api";
import RecentSection from "../../containers/RecentSection";
import XraySection from "../../containers/XraySection";

export interface HomeContentProps {
  databases: Database[];
  recents: RecentView[];
}

const HomeContent = ({
  databases,
  recents,
}: HomeContentProps): JSX.Element | null => {
  if (recents.length) {
    return <RecentSection />;
  } else if (databases.some(isSyncCompleted)) {
    return <XraySection />;
  } else {
    return null;
  }
};

export default HomeContent;
