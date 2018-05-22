import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";
import { push } from "react-router-redux";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal";

import Activity from "../components/Activity";
import RecentViews from "../components/RecentViews";
import Smile from "../components/Smile";
import NewUserOnboardingModal from "../components/NewUserOnboardingModal";
import NextStep from "../components/NextStep";

import * as homepageActions from "../actions";
import { getActivity, getRecentViews, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  activity: getActivity(state),
  recentViews: getRecentViews(state),
  user: getUser(state),
  showOnboarding: "new" in props.location.query,
});

const mapDispatchToProps = {
  ...homepageActions,
  onChangeLocation: push,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class HomepageApp extends Component {
  static propTypes = {
    onChangeLocation: PropTypes.func.isRequired,
    showOnboarding: PropTypes.bool.isRequired,
    user: PropTypes.object.isRequired,
    // TODO - these should be used by their call sites rather than passed
    activity: PropTypes.array,
    fetchActivity: PropTypes.func.isRequired,

    recentViews: PropTypes.array,
    fetchRecentViews: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      greeting: Greeting.sayHello(props.user && props.user.first_name),
      onboarding: props.showOnboarding,
    };
  }

  completeOnboarding() {
    this.setState({ onboarding: false });
  }

  render() {
    const { user } = this.props;

    return (
      <div className="full">
        {this.state.onboarding ? (
          <Modal>
            <NewUserOnboardingModal
              user={user}
              onClose={() => this.completeOnboarding()}
            />
          </Modal>
        ) : null}

        <div className="bg-white md-bg-brand text-brand md-text-white md-pl4">
          <div className="HomepageGreeting">
            <div className="Layout-mainColumn">
              <header className="flex align-center px2 py3 md-pb4">
                <Smile />
                <div className="h1 text-bold md-ml2">{this.state.greeting}</div>
              </header>
            </div>
          </div>
        </div>
        <div className="flex">
          <div className="wrapper">
            <div className="Layout-mainColumn pl2">
              <div className="md-pt4 h3 md-h2">{t`Activity`}</div>
              <Activity {...this.props} />
            </div>
          </div>
          <div className="Layout-sidebar flex-no-shrink hide sm-show">
            <div>
              <NextStep />
              <RecentViews {...this.props} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
