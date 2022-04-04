import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/recent-items";
import { RecentItem } from "metabase-types/api";
import HomeCaption from "../HomeCaption";
import HomeModelCard from "../HomeModelCard";
import { SectionBody } from "./HomeRecentSection.styled";

export interface HomeRecentSectionProps {
  recentItems: RecentItem[];
}

const HomeRecentSection = ({
  recentItems,
}: HomeRecentSectionProps): JSX.Element => {
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
      </SectionBody>
    </div>
  );
};

export default HomeRecentSection;
