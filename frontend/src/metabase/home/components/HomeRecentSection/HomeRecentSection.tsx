import { t } from "ttag";

import { useListRecentsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useGetIcon } from "metabase/hooks/use-icon";
import { getUser } from "metabase/selectors/user";
import { getName } from "metabase/utils/name";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { RecentItem } from "metabase-types/api";

import { isWithinWeeks } from "../../utils";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";

import S from "./HomeRecentSection.module.css";

export const HomeRecentSection = () => {
  const getIcon = useGetIcon();
  const { data: recentItems = [], isLoading, error } = useListRecentsQuery();
  const user = useSelector(getUser);
  const hasHelpCard =
    user != null && user.is_installer && isWithinWeeks(user.first_login, 2);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <HomeCaption>{t`Pick up where you left off`}</HomeCaption>
      <div className={S.SectionBody}>
        {recentsFilter(recentItems).map((item, index) => (
          <HomeModelCard
            key={index}
            title={getName(item)}
            icon={getIcon(item)}
            url={Urls.modelToUrl(item) ?? ""}
          />
        ))}
        {hasHelpCard && <HomeHelpCard />}
      </div>
    </div>
  );
};

export const recentsFilter = (results: RecentItem[]): RecentItem[] => {
  return results.filter((item) => item.model !== "collection").slice(0, 5);
};
