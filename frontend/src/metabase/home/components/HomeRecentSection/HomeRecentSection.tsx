import React from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/recent-items";
import { getUser } from "metabase/selectors/user";
import { useRecentItemListQuery } from "metabase/common/hooks";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";
import { isWithinWeeks } from "../../utils";
import { SectionBody } from "./HomeRecentSection.styled";

export const HomeRecentSection = () => {
  const user = useSelector(getUser);
  const { data: recentItems = [] } = useRecentItemListQuery();
  const hasHelpCard =
    user != null && user.is_installer && isWithinWeeks(user.first_login, 2);

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
