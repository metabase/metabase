import React from "react";
import moment from "moment";
import { parseTimestamp } from "metabase/lib/time";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, RecentView, User } from "metabase-types/api";
import PopularSection from "../../containers/PopularSection";
import RecentSection from "../../containers/RecentSection";
import XraySection from "../../containers/XraySection";

export interface HomeContentProps {
  user: User;
  databases: Database[];
  recentViews: RecentView[];
}

const HomeContent = (props: HomeContentProps): JSX.Element | null => {
  if (isPopularSection(props)) {
    return <PopularSection />;
  }

  if (isRecentSection(props)) {
    return <RecentSection />;
  }

  if (isXraySection(props)) {
    return <XraySection />;
  }

  return null;
};

const isPopularSection = ({ user, recentViews }: HomeContentProps) => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    (isWithinWeek(user.date_joined) || !recentViews.length)
  );
};

const isRecentSection = ({ recentViews }: HomeContentProps) => {
  return recentViews.length > 0;
};

const isXraySection = ({ databases }: HomeContentProps) => {
  return databases.some(isSyncCompleted);
};

const isWithinWeek = (timestamp: string) => {
  const date = parseTimestamp(timestamp);
  const today = moment();
  const weekAgo = today.clone().subtract(1, "week");

  return date.isBetween(weekAgo, today);
};

export default HomeContent;
