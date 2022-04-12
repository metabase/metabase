import React from "react";
import moment from "moment";
import { parseTimestamp } from "metabase/lib/time";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, PopularItem, RecentItem, User } from "metabase-types/api";
import HomePopularSection from "../../containers/HomePopularSection";
import HomeRecentSection from "../../containers/HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";

export interface HomeContentProps {
  user: User;
  databases: Database[];
  recentItems: RecentItem[];
  popularItems: PopularItem[];
}

const HomeContent = (props: HomeContentProps): JSX.Element | null => {
  if (isPopularSection(props)) {
    return <HomePopularSection />;
  }

  if (isRecentSection(props)) {
    return <HomeRecentSection />;
  }

  if (isXraySection(props)) {
    return <HomeXraySection />;
  }

  return null;
};

const isPopularSection = ({
  user,
  recentItems,
  popularItems,
}: HomeContentProps): boolean => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    popularItems.length > 0 &&
    (isWithinWeek(user.date_joined) || !recentItems.length)
  );
};

const isRecentSection = ({ user, recentItems }: HomeContentProps): boolean => {
  return user.has_question_and_dashboard && recentItems.length > 0;
};

const isXraySection = ({ databases }: HomeContentProps): boolean => {
  return databases.some(isSyncCompleted);
};

const isWithinWeek = (timestamp: string): boolean => {
  const date = parseTimestamp(timestamp);
  const weekAgo = moment().subtract(1, "week");
  return date.isAfter(weekAgo);
};

export default HomeContent;
