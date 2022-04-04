import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/recents";
import { RecentView } from "metabase-types/api";
import {
  RecentCard,
  RecentIcon,
  RecentList,
  RecentTitle,
  SectionTitle,
} from "./RecentSection.styled";

export interface RecentSectionProps {
  recents: RecentView[];
}

const RecentSection = ({ recents }: RecentSectionProps): JSX.Element => {
  return (
    <div>
      <SectionTitle>{t`Pick up where you left off`}</SectionTitle>
      <RecentList>
        {recents.map((item, index) => (
          <RecentCard key={index} url={Urls.modelToUrl(item) ?? ""}>
            <RecentIcon {...getIcon(item)} />
            <RecentTitle>{getName(item)}</RecentTitle>
          </RecentCard>
        ))}
      </RecentList>
    </div>
  );
};

export default RecentSection;
