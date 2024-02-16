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
import type { UseEntityListQueryResult } from "metabase/common/hooks/use-entity-list-query";
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
  const databases = useDatabaseListQuery();
  const recentItems = useRecentItemListQuery({ reload: true });
  const popularItems = usePopularItemListQuery({ reload: true });
  const { isLoading, error } = getRequestState(
    user,
    databases,
    recentItems,
    popularItems,
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!user || isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (isAdmin && shouldShowEmbedHomepage()) {
    return <EmbedMinimalHomepage onDismiss={update} />;
  }

  if (isPopularSection(user, recentItems.data, popularItems.data)) {
    return <HomePopularSection />;
  }

  if (isRecentSection(user, recentItems.data)) {
    return <HomeRecentSection />;
  }

  if (isXraySection(databases.data, isXrayEnabled)) {
    return <HomeXraySection />;
  }

  return null;
};

const getRequestState = (
  user: User | null,
  databases: UseEntityListQueryResult<Database>,
  recentItems: UseEntityListQueryResult<RecentItem>,
  popularItems: UseEntityListQueryResult<PopularItem>,
): { isLoading: boolean; error: unknown } => {
  if (!user) {
    return { isLoading: true, error: null };
  } else if (!user.has_question_and_dashboard) {
    return { isLoading: databases.data == null, error: databases.error };
  } else if (user.is_installer || !isWithinWeeks(user.first_login, 1)) {
    const isLoading = databases.data == null || recentItems.data == null;
    const error = databases.error || recentItems.error;
    return { isLoading, error };
  } else {
    const isLoading =
      databases.data == null ||
      recentItems.data == null ||
      popularItems.data == null;
    const error = databases.error || recentItems.error || popularItems.error;
    return { isLoading, error };
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
