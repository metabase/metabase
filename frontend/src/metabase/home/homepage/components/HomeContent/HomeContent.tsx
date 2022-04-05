import React from "react";
import moment from "moment";
import { parseTimestamp } from "metabase/lib/time";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, RecentItem, User } from "metabase-types/api";
import HomePopularSection from "../../containers/HomePopularSection";
import HomeRecentSection from "../../containers/HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";

export interface HomeContentProps {
  user: User;
  databases: Database[];
  recentItems: RecentItem[];
}

const HomeContent = (props: HomeContentProps): JSX.Element | null => {
  if (isPopularSection(props)) {
    return <HomeXraySection />;
  }

  if (isRecentSection(props)) {
    return <HomeXraySection />;
  }

  if (isXraySection(props)) {
    return <HomeXraySection />;
  }

  return null;
};

const isPopularSection = ({ user, recentItems }: HomeContentProps) => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    (isWithinWeek(user.date_joined) || !recentItems.length)
  );
};

const isRecentSection = ({ recentItems }: HomeContentProps) => {
  return recentItems.length > 0;
};

const isXraySection = ({ databases }: HomeContentProps) => {
  return databases.some(isSyncCompleted);
};

const isWithinWeek = (timestamp: string) => {
  const date = parseTimestamp(timestamp);
  const weekAgo = moment().subtract(1, "week");
  return date.isAfter(weekAgo);
};

export default HomeContent;
