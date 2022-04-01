import React from "react";
import { t } from "ttag";
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
      <SectionTitle>{t`Pick up where you left off`}</SectionTitle>
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

export default PopularSection;
