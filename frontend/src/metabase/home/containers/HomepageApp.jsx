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

import * as homepageActions from "../actions";
import { getActivity, getRecentViews, getUser } from "../selectors";

import { Box, Flex } from "grid-styled";

const mapStateToProps = (state, props) => ({
  activity: getActivity(state),
  recentViews: getRecentViews(state),
  user: getUser(state),
});

const mapDispatchToProps = {
  ...homepageActions,
  onChangeLocation: push,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class HomepageApp extends Component {
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
      <Box mx={4}>
        <Box py={3}>
          <Subhead>{t`Activity`}</Subhead>
        </Box>
        <Flex>
          <Box w={2 / 3}>
            <Card px={1}>
              <Activity {...this.props} />
            </Card>
          </Box>
          <Box w={1 / 3}>
            <NextStep />
            <RecentViews {...this.props} />
          </Box>
        </Flex>
      </Box>
    );
  }
}
