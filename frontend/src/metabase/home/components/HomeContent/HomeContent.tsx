import { useUpdate } from "react-use";

import {
  useDatabaseListQuery,
  usePopularItemListQuery,
  useRecentItemListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type Database from "metabase-lib/metadata/Database";
import type { PopularItem, RecentItem, User } from "metabase-types/api";

import { getIsXrayEnabled } from "../../selectors";
import { isWithinWeeks, shouldShowEmbedHomepage } from "../../utils";
import { EmbedMinimalHomepage } from "../EmbedMinimalHomepage";
import { HomePopularSection } from "../HomePopularSection";
import { HomeRecentSection } from "../HomeRecentSection";
import { HomeXraySection } from "../HomeXraySection";

export const HomeContent = (): JSX.Element | null => {
  const update = useUpdate();
  const user = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const isXrayEnabled = useSelector(getIsXrayEnabled);
  const { data: databases, error: databasesError } = useDatabaseListQuery();
  const { data: recentItems, error: recentItemsError } = useRecentItemListQuery(
    { reload: true },
  );
  const { data: popularItems, error: popularItemsError } =
    usePopularItemListQuery({ reload: true });
  const error = databasesError || recentItemsError || popularItemsError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!user || isLoading(user, databases, recentItems, popularItems)) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (isAdmin && shouldShowEmbedHomepage()) {
    return <EmbedMinimalHomepage onDismiss={update} />;
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
