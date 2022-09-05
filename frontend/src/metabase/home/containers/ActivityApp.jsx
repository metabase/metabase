import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { push } from "react-router-redux";

import Card from "metabase/components/Card";
import Subhead from "metabase/components/type/Subhead";

import Activity from "../components/Activity";
import RecentViews from "../components/RecentViews";
import NextStep from "../components/NextStep";

import * as activityActions from "../actions";
import { getActivity, getRecentViews, getUser } from "../selectors";
import {
  ActivityBody,
  ActivityHeader,
  ActivityMain,
  ActivityRoot,
  ActivitySidebar,
} from "./ActivityApp.styled";

const mapStateToProps = (state, props) => ({
  activity: getActivity(state),
  recentViews: getRecentViews(state),
  user: getUser(state),
});

const mapDispatchToProps = {
  ...activityActions,
  onChangeLocation: push,
};

class ActivityApp extends Component {
  static propTypes = {
    onChangeLocation: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    // TODO - these should be used by their call sites rather than passed
    activity: PropTypes.array,
    fetchActivity: PropTypes.func.isRequired,

    recentViews: PropTypes.array,
    fetchRecentViews: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
  }

  render() {
    return (
      <ActivityRoot>
        <ActivityHeader>
          <Subhead>{t`Activity`}</Subhead>
        </ActivityHeader>
        <ActivityBody>
          <ActivityMain>
            <Card px={1}>
              <Activity {...this.props} />
            </Card>
          </ActivityMain>
          <ActivitySidebar>
            <NextStep />
            <RecentViews {...this.props} />
          </ActivitySidebar>
        </ActivityBody>
      </ActivityRoot>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ActivityApp);
