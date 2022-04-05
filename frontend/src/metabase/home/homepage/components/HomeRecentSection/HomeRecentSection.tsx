import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/recent-views";
import { RecentView } from "metabase-types/api";
import HomeModelCard from "../HomeModelCard";
import { SectionBody, SectionTitle } from "./HomeRecentSection.styled";

export interface HomeRecentSectionProps {
  recentViews: RecentView[];
}

const HomeRecentSection = ({
  recentViews,
}: HomeRecentSectionProps): JSX.Element => {
  return (
    <div>
      <SectionTitle>{t`Pick up where you left off`}</SectionTitle>
      <SectionBody>
        {recentViews.map((item, index) => (
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
