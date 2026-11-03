import { t } from "ttag";

import { useListRecentsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { IconData } from "metabase/common/utils/icon";
import { getUser } from "metabase/current-user";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";
import { getName } from "metabase/utils/name";
import type { RecentItem } from "metabase-types/api";

import { isWithinWeeks } from "../../utils";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";
import { HomeSectionSkeleton } from "../HomeSectionSkeleton";

import S from "./HomeRecentSection.module.css";

export const HomeRecentSection = () => {
  const getIcon = useGetIcon();
  const { data: recentItems = [], isLoading, error } = useListRecentsQuery();
  const user = useSelector(getUser);
  const hasHelpCard =
    user != null && user.is_installer && isWithinWeeks(user.first_login, 2);

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading) {
    return <HomeSectionSkeleton />;
  }

  return (
    <div data-testid="recent-items-section">
      <HomeRecentItems
        cards={recentsFilter(recentItems).map((item) => ({
          title: getName(item),
          icon: getIcon(item),
          url: Urls.modelToUrl(item) ?? "",
        }))}
        hasHelpCard={hasHelpCard}
      />
    </div>
  );
};

export type HomeRecentCard = {
  title: string;
  icon: IconData;
  url: string;
};

type HomeRecentItemsProps = {
  cards: HomeRecentCard[];
  hasHelpCard?: boolean;
};

/** The "Pick up where you left off" caption and its row of item cards. */
export const HomeRecentItems = ({
  cards,
  hasHelpCard = false,
}: HomeRecentItemsProps) => (
  <div>
    <HomeCaption>{t`Pick up where you left off`}</HomeCaption>
    <div className={S.SectionBody}>
      {cards.map((card, index) => (
        <HomeModelCard
          key={index}
          title={card.title}
          icon={card.icon}
          url={card.url}
        />
      ))}
      {hasHelpCard && <HomeHelpCard />}
    </div>
  </div>
);

export const recentsFilter = (results: RecentItem[]): RecentItem[] => {
  return results.filter((item) => item.model !== "collection").slice(0, 5);
};
