import React, { Component, PropTypes } from "react";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal.jsx";

import Activity from "./Activity.jsx";
import RecentViews from "./RecentViews.jsx";
import Smile from './Smile.jsx';
import NewUserOnboardingModal from './NewUserOnboardingModal.jsx';

export default class Homepage extends Component {

    static propTypes = {
        onChangeLocation: PropTypes.func.isRequired,
        showOnboarding: PropTypes.bool.isRequired,
        user: PropTypes.object.isRequired,
        activity: PropTypes.array,
        fetchActivity: PropTypes.func.isRequired,
        fetchRecentViews: PropTypes.func.isRequired
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            greeting: Greeting.sayHello(props.user && props.user.first_name),
            onboarding: props.showOnboarding
        };

        this.styles = {
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    completeOnboarding() {
        this.setState({ onboarding: false });
    }

    render() {
        const { user } = this.props;

        return (
            <div className="full">
                { this.state.onboarding ?
                    <Modal>
                        <NewUserOnboardingModal
                            user={user}
                            closeFn={() => (this.completeOnboarding())}
                        />
                    </Modal>
                : null }

                <div className="CheckBg bg-brand text-white md-pl4">
                    <div style={{marginRight: 346}}>
                        <div className="Layout-mainColumn">
                            <header style={this.styles.headerGreeting} className="flex align-center pb4 pt1">
                                <Smile />
                                <div className="ml2">{this.state.greeting}</div>
                            </header>
                        </div>
                    </div>
                </div>
                <div className="flex">
                    <div className="wrapper">
                        <div className="Layout-mainColumn pl2">
                          <div className="pt4 h2 text-normal ml2">Activity</div>
                          <Activity {...this.props} />
                        </div>
                    </div>
                    <div className="Layout-sidebar flex-no-shrink">
                      <RecentViews {...this.props} />
                    </div>
                </div>
            </div>
        );
    }
}
