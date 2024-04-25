import { t } from "ttag";

import { useRecentItemListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getIcon, getName } from "metabase/entities/recent-items";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";

import { isWithinWeeks } from "../../utils";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";

import { SectionBody } from "./HomeRecentSection.styled";

export const HomeRecentSection = () => {
  const { data: recentItems = [], isLoading, error } = useRecentItemListQuery();
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
        {recentItems.map((item, index) => (
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
