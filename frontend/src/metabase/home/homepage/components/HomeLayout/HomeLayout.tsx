import React, { ReactNode, useState } from "react";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import MetabotWidget from "metabase/metabot/components/MetabotWidget";
import { State } from "metabase-types/store";
import Tooltip from "metabase/core/components/Tooltip/Tooltip";
import HomeGreeting from "../HomeGreeting";
import CustomHomePageModal from "../Modals/CustomHomePageModal/CustomHomePageModal";
import {
  LayoutBody,
  LayoutEditButton,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

interface OwnProps {
  hasMetabot?: boolean;
  children?: ReactNode;
  isAdmin?: boolean;
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
  isAdmin = true,
}: HomeLayoutProps): JSX.Element => {
  const [showModal, setShowModal] = useState(false);

  return (
    <LayoutRoot>
      {hasIllustration && <LayoutIllustration />}
      {hasMetabot ? <MetabotWidget /> : <HomeGreeting />}
      {isAdmin && (
        <Tooltip tooltip="Pick a dashboard to serve as the homepage">
          <LayoutEditButton
            icon="pencil"
            borderless
            onClick={() => setShowModal(true)}
          >
            Customize
          </LayoutEditButton>
        </Tooltip>
      )}
      <LayoutBody>{children}</LayoutBody>
      <CustomHomePageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </LayoutRoot>
  );
};

export default connect(mapStateToProps)(HomeLayout);
