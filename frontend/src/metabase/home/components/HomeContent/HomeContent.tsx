import { useMemo, useState } from "react";
import { Box, Flex, Icon, Paper, Textarea } from "metabase/ui";
import { t } from "ttag";

import { useListPopularItemsQuery, useListRecentsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDatabaseListQuery, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { getUser } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type { PopularItem, RecentItem, User } from "metabase-types/api";

import { getIsXrayEnabled } from "../../selectors";
import { isWithinWeeks } from "../../utils";
import { EmbedHomepage } from "../EmbedHomepage";
import { HomePopularSection } from "../HomePopularSection";
import { HomeRecentSection, recentsFilter } from "../HomeRecentSection";
import { HomeXraySection } from "../HomeXraySection";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const HomeContent = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const embeddingHomepage = useSetting("embedding-homepage");
  const isXrayEnabled = useSelector(getIsXrayEnabled);

  const [prompt, setPrompt] = useState("");
  const metabot = useMetabotAgent();

  const { data: databases, error: databasesError } = useDatabaseListQuery();
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

  return (
    <Box>
      <Flex align="center" justify="center">
        <Paper w="640">
          <Textarea
            id="metabot-chat-input"
            data-testid="metabot-chat-input"
            w="100%"
            autosize
            minRows={10}
            maxRows={20}
            autoFocus
            value={prompt}
            placeholder={t`What would you like to know?`}
            onChange={(e) => setPrompt(e.target.value)}
            styles={{
              input: {
                fontSize: '16px',
                padding: '16px',
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) {
                return;
              }
              const isModifiedKeyPress =
                e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
              if (e.key === "Enter" && !isModifiedKeyPress) {
                // prevent event from inserting new line + interacting with other content
                e.preventDefault();
                e.stopPropagation();
                metabot.submitInput(e.target.value);
              }
            }}
          />
        </Paper>
      </Flex>
    </Box>
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!user || isLoading(user, databases, recentItems, popularItems)) {
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
