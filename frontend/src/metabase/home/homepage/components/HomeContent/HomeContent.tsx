import React from "react";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, RecentView } from "metabase-types/api";
import RecentSection from "../../containers/RecentSection";
import XraySection from "../../containers/XraySection";

export interface HomeContentProps {
  databases: Database[];
  recentViews: RecentView[];
}

const HomeContent = ({
  databases,
  recentViews,
}: HomeContentProps): JSX.Element | null => {
  if (recentViews.length) {
    return <RecentSection />;
  } else if (databases.some(isSyncCompleted)) {
    return <XraySection />;
  } else {
    return null;
  }
};

export default HomeContent;
