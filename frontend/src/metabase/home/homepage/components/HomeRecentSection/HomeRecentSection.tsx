import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/recent-items";
import { RecentItem, User } from "metabase-types/api";
import HomeCaption from "../HomeCaption";
import HomeHelpCard from "../HomeHelpCard";
import HomeModelCard from "../HomeModelCard";
import { isWithinWeeks } from "../../utils";
import { SectionBody } from "./HomeRecentSection.styled";

export interface HomeRecentSectionProps {
  user: User;
  recentItems: RecentItem[];
}

const HomeRecentSection = ({
  user,
  recentItems,
}: HomeRecentSectionProps): JSX.Element => {
  const hasHelpCard = user.is_installer && isWithinWeeks(user.first_login, 2);

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
        <iframe
          src="http://localhost:3000/public/question/4d44dbc4-f3c6-4b0c-8e81-6d0a01882ada"
          frameBorder="0"
          width="800"
          height="600"
          allowTransparency
        ></iframe>
      </SectionBody>
    </div>
  );
};

export default HomeRecentSection;
