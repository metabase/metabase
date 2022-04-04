import React from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/popular-views";
import { PopularView } from "metabase-types/api";
import HomeHelpCard from "../HomeHelpCard";
import HomeModelCard from "../HomeModelCard";
import { SectionBody, SectionTitle } from "./HomePopularSection.styled";

export interface HomePopularSectionProps {
  popularViews: PopularView[];
}

const HomePopularSection = ({
  popularViews,
}: HomePopularSectionProps): JSX.Element => {
  return (
    <div>
      <SectionTitle>{getTitle(popularViews)}</SectionTitle>
      <SectionBody>
        {popularViews.map((item, index) => (
          <HomeModelCard
            key={index}
            title={getName(item)}
            icon={getIcon(item)}
            url={Urls.modelToUrl(item) ?? ""}
          />
        ))}
        <HomeHelpCard />
      </SectionBody>
    </div>
  );
};

const getTitle = (popularViews: PopularView[]) => {
  const models = _.uniq(popularViews.map(item => item.model));

  if (models.length !== 1) {
    return t`Here is some popular stuff`;
  }

  switch (models[0]) {
    case "table":
      return t`Here are some popular tables`;
    case "card":
      return t`Here are some popular questions`;
    case "dataset":
      return t`Here are some popular models`;
    case "dashboard":
      return t`Here are some popular dashboards`;
    default:
      return t`Here is some popular stuff`;
  }
};

export default HomePopularSection;
