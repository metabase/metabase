import React from "react";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { getUser } from "metabase/selectors/user";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  useDatabaseListQuery,
  usePopularItemListQuery,
  useRecentItemListQuery,
} from "metabase/common/hooks";
import { PopularItem, RecentItem, User } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
import { HomePopularSection } from "../HomePopularSection";
import { HomeRecentSection } from "../HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";
import { getIsXrayEnabled } from "../../selectors";
import { isWithinWeeks } from "../../utils";

export const HomeContent = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const isXrayEnabled = useSelector(getIsXrayEnabled);
  const { data: databases } = useDatabaseListQuery();
  const { data: recentItems } = useRecentItemListQuery();
  const { data: popularItems } = usePopularItemListQuery();

  if (!user || isLoading(user, databases, recentItems, popularItems)) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (isPopularSection(user, recentItems, popularItems)) {
    return <HomePopularSection />;
  }

  if (isRecentSection(user, recentItems)) {
    return <HomeRecentSection />;
  }

  if (isXraySection(databases, isXrayEnabled)) {
    return <HomeXraySection />;
  }

  return null;
};

const isLoading = (
  user: User,
  databases: Database[] | undefined,
  recentItems: RecentItem[] | undefined,
  popularItems: PopularItem[] | undefined,
): boolean => {
  if (!user.has_question_and_dashboard) {
    return databases == null;
  } else if (user.is_installer || !isWithinWeeks(user.first_login, 1)) {
    return databases == null || recentItems == null;
  } else {
    return databases == null || recentItems == null || popularItems == null;
  }
};

const isPopularSection = (
  user: User,
  recentItems: RecentItem[] = [],
  popularItems: PopularItem[] = [],
): boolean => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    popularItems.length > 0 &&
    (isWithinWeeks(user.first_login, 1) || !recentItems.length)
  );
};

const isRecentSection = (
  user: User,
  recentItems: RecentItem[] = [],
): boolean => {
  return user.has_question_and_dashboard && recentItems.length > 0;
};

const isXraySection = (
  databases: Database[] = [],
  isXrayEnabled: boolean,
): boolean => {
  return databases.some(isSyncCompleted) && isXrayEnabled;
};
