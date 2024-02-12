import { useUpdate } from "react-use";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  useDatabaseListQuery,
  usePopularItemListQuery,
  useRecentItemListQuery,
} from "metabase/common/hooks";
import type { PopularItem, RecentItem, User } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";
import { HomePopularSection } from "../HomePopularSection";
import { HomeRecentSection } from "../HomeRecentSection";
import { HomeXraySection } from "../HomeXraySection";
import { getIsXrayEnabled } from "../../selectors";
import { isWithinWeeks, shouldShowEmbedHomepage } from "../../utils";
import { EmbedMinimalHomepage } from "../EmbedMinimalHomepage";

export const HomeContent = (): JSX.Element | null => {
  const update = useUpdate();
  const user = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const isXrayEnabled = useSelector(getIsXrayEnabled);
  const { data: databases, isLoading: isDatabasesLoading } =
    useDatabaseListQuery();
  const { data: recentItems, isLoading: isRecentItemsLoading } =
    useRecentItemListQuery({ reload: true });
  const { data: popularItems, isLoading: isPopularItemsLoading } =
    usePopularItemListQuery({ reload: true });

  if (
    !user ||
    isLoading(
      user,
      isDatabasesLoading,
      isRecentItemsLoading,
      isPopularItemsLoading,
    )
  ) {
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
  isDatabasesLoading: boolean,
  isRecentItemsLoading: boolean,
  isPopularItemsLoading: boolean,
): boolean => {
  if (!user.has_question_and_dashboard) {
    return isDatabasesLoading;
  } else if (user.is_installer || !isWithinWeeks(user.first_login, 1)) {
    return isDatabasesLoading || isRecentItemsLoading;
  } else {
    return isDatabasesLoading || isRecentItemsLoading || isPopularItemsLoading;
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
