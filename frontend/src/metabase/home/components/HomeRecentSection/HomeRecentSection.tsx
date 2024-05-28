import { t } from "ttag";

import { useListRecentItemsQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";
import type { RecentItem } from "metabase-types/api";

import { isWithinWeeks } from "../../utils";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";

import { SectionBody } from "./HomeRecentSection.styled";

export const HomeRecentSection = () => {
  const {
    data: recentItems = [],
    isLoading,
    error,
  } = useListRecentItemsQuery();
  const user = useSelector(getUser);
  const hasHelpCard =
    user != null && user.is_installer && isWithinWeeks(user.first_login, 2);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
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
  );
};

export const recentsFilter = (results: RecentItem[]): RecentItem[] => {
  return results.filter(item => item.model !== "collection").slice(0, 5);
};
