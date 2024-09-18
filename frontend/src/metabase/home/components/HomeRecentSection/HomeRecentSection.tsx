import { t } from "ttag";

import { useListRecentsQuery } from "metabase/api";
import { CommentFeed } from "metabase/comments";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";
import { Flex, Paper } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { isWithinWeeks } from "../../utils";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";

import { SectionBody } from "./HomeRecentSection.styled";

export const HomeRecentSection = () => {
  const { data: recentItems = [], isLoading, error } = useListRecentsQuery();
  const user = useSelector(getUser);
  const hasHelpCard =
    user != null && user.is_installer && isWithinWeeks(user.first_login, 2);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Flex gap="lg">
      <div style={{ width: "50%" }}>
        <HomeCaption>{t`Pick up where you left off`}</HomeCaption>
        <SectionBody>
          {recentsFilter(recentItems).map((item, index) => (
            <HomeModelCard
              key={index}
              title={getName(item)}
              icon={getIcon(item)}
              url={Urls.modelToUrl(item) ?? ""}
            />
          ))}
          {hasHelpCard && <HomeHelpCard />}
        </SectionBody>
      </div>
      <div style={{ width: "50%" }}>
        <HomeCaption>{t`What people are discussing`}</HomeCaption>
        <Paper p="lg" mah="20rem" style={{ overflow: "auto" }}>
          <CommentFeed />
        </Paper>
      </div>
    </Flex>
  );
};

export const recentsFilter = (results: RecentItem[]): RecentItem[] => {
  return results.filter(item => item.model !== "collection").slice(0, 5);
};
