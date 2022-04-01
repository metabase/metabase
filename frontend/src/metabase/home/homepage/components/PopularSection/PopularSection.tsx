import React from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/popular-views";
import { PopularView } from "metabase-types/api";
import {
  PopularCard,
  PopularIcon,
  PopularList,
  PopularTitle,
  SectionTitle,
} from "./PopularSection.styled";

export interface PopularSectionProps {
  popularViews: PopularView[];
}

const PopularSection = ({ popularViews }: PopularSectionProps): JSX.Element => {
  return (
    <div>
      <SectionTitle>{getTitle(popularViews)}</SectionTitle>
      <PopularList>
        {popularViews.map((item, index) => (
          <PopularCard key={index} url={Urls.modelToUrl(item) ?? ""}>
            <PopularIcon {...getIcon(item)} />
            <PopularTitle>{getName(item)}</PopularTitle>
          </PopularCard>
        ))}
      </PopularList>
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

export default PopularSection;
