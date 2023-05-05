import React, { ReactNode, useState } from "react";
import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
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
}

interface StateProps {
  hasIllustration?: boolean;
  isAdmin?: boolean;
}

type HomeLayoutProps = OwnProps & StateProps;

const mapStateToProps = (state: State) => ({
  hasIllustration: getSetting(state, "show-lighthouse-illustration"),
  isAdmin: getUserIsAdmin(state),
});

const HomeLayout = ({
  hasMetabot,
  hasIllustration,
  children,
  isAdmin,
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(HomeLayout);
