import React, { ReactNode } from "react";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import MetabotWidget from "metabase/metabot/components/MetabotWidget";
import { State } from "metabase-types/store";
import HomeGreeting from "../HomeGreeting";
import {
  LayoutBody,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

interface OwnProps {
  hasMetabot?: boolean;
  children?: ReactNode;
}

interface StateProps {
  hasIllustration?: boolean;
}

type HomeLayoutProps = OwnProps & StateProps;

const mapStateToProps = (state: State) => ({
  hasIllustration: getSetting(state, "show-lighthouse-illustration"),
});

const HomeLayout = ({
  hasMetabot,
  hasIllustration,
  children,
}: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      {hasIllustration && <LayoutIllustration />}
      {hasMetabot ? <MetabotWidget /> : <HomeGreeting />}
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(HomeLayout);
