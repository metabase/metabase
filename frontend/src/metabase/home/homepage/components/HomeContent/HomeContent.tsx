import React from "react";
import { isSyncCompleted } from "metabase/lib/syncing";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Database, PopularItem, RecentItem, User } from "metabase-types/api";
import HomePopularSection from "../../containers/HomePopularSection";
import HomeRecentSection from "../../containers/HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";
import { isWithinWeeks } from "../../utils";

export interface HomeContentProps {
  user: User;
  databases?: Database[];
  recentItems?: RecentItem[];
  popularItems?: PopularItem[];
  isXrayEnabled: boolean;
}

const HomeContent = (props: HomeContentProps): JSX.Element | null => {
  if (isLoading(props)) {
    return <LoadingAndErrorWrapper loading />;
  }

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

const isLoading = ({
  user,
  databases,
  recentItems,
  popularItems,
}: HomeContentProps): boolean => {
  if (!user.has_question_and_dashboard) {
    return databases == null;
  } else if (user.is_installer || !isWithinWeeks(user.first_login, 1)) {
    return databases == null || recentItems == null;
  } else {
    return databases == null || recentItems == null || popularItems == null;
  }
};

const isPopularSection = ({
  user,
  recentItems = [],
  popularItems = [],
}: HomeContentProps): boolean => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    popularItems.length > 0 &&
    (isWithinWeeks(user.first_login, 1) || !recentItems.length)
  );
};

const isRecentSection = ({
  user,
  recentItems = [],
}: HomeContentProps): boolean => {
  return user.has_question_and_dashboard && recentItems.length > 0;
};

const isXraySection = ({
  databases = [],
  isXrayEnabled,
}: HomeContentProps): boolean => {
  return databases.some(isSyncCompleted) && isXrayEnabled;
};

export default HomeContent;
