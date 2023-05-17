import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import RecentItems, { getIcon, getName } from "metabase/entities/recent-items";
import { getUser } from "metabase/selectors/user";
import { RecentItem, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import HomeCaption from "../HomeCaption";
import HomeHelpCard from "../HomeHelpCard";
import HomeModelCard from "../HomeModelCard";
import { isWithinWeeks } from "../../utils";
import { SectionBody } from "./HomeRecentSection.styled";

interface EntityLoaderProps {
  recentItems: RecentItem[];
}

interface StateProps {
  user: User | null;
}

export type HomeRecentSectionProps = EntityLoaderProps & StateProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state),
});

const HomeRecentSection = ({
  user,
  recentItems,
}: HomeRecentSectionProps): JSX.Element => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  RecentItems.loadList(),
  connect(mapStateToProps),
)(HomeRecentSection);
