import { useMemo } from "react";

import {
  useListDatabasesQuery,
  useListPopularItemsQuery,
  useListRecentsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { useMarkPageReady } from "metabase/utils/performance-marks";
import { isSyncCompleted } from "metabase/utils/syncing";
import type {
  Database,
  PopularItem,
  RecentItem,
  User,
} from "metabase-types/api";

import { isWithinWeeks } from "../../utils";
import { EmbedHomepage } from "../EmbedHomepage";
import { HomePopularSection } from "../HomePopularSection";
import { HomeRecentSection, recentsFilter } from "../HomeRecentSection";
import { HomeXraySection } from "../HomeXraySection";

export const HomeContent = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const embeddingHomepage = useSetting("embedding-homepage");
  const isXrayEnabled = useSetting("enable-xrays");

  const { data: databasesResponse, error: databasesError } =
    useListDatabasesQuery();
  const databases = databasesResponse?.data;
  const { data: recentItemsRaw, error: recentItemsError } = useListRecentsQuery(
    undefined,
    { refetchOnMountOrArgChange: true },
  );
  const { data: popularItems, error: popularItemsError } =
    useListPopularItemsQuery(undefined, { refetchOnMountOrArgChange: true });
  const error = databasesError || recentItemsError || popularItemsError;

  const recentItems = useMemo(
    () => (recentItemsRaw && recentsFilter(recentItemsRaw)) ?? [],
    [recentItemsRaw],
  );

  const isContentReady = Boolean(
    !error && user && !isLoading(user, databases, recentItems, popularItems),
  );

  // The home page is what the load benchmark measures, so it reports when its
  // own content is in hand rather than leaving the reading to the shell.
  useMarkPageReady(isContentReady);

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  // `!user` is implied by `!isContentReady`, and repeating it narrows the
  // type for everything below.
  if (!isContentReady || !user) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (embeddingHomepage === "visible" && user.is_superuser) {
    return <EmbedHomepage />;
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
