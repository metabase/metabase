import React from "react";
import moment from "moment";
import { parseTimestamp } from "metabase/lib/time";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database, RecentView, User } from "metabase-types/api";
import HomePopularSection from "../../containers/HomePopularSection";
import HomeRecentSection from "../../containers/HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";

export interface HomeContentProps {
  user: User;
  databases: Database[];
  recents: RecentView[];
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

const isPopularSection = ({ user, recents }: HomeContentProps) => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    (isWithinWeek(user.date_joined) || !recents.length)
  );
};

const isRecentSection = ({ recents }: HomeContentProps) => {
  return recents.length > 0;
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
