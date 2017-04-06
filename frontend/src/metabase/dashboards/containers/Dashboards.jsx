import React, { Component, PropTypes } from 'react';
import { connect } from "react-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import WhatsADashboard from "../components/WhatsADashboard";
import DashboardList from "../components/DashboardList";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import Modal from "metabase/components/Modal.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import Icon from "metabase/components/Icon.jsx";

// import _ from "underscore";
// import cx from "classnames";

import { createDashboard, fetchDashboards } from "../dashboards";
import { getDashboards } from "../selectors";

const mapStateToProps = (state, props) => ({
    dashboards: getDashboards(state)
});

const mapDispatchToProps = {
    createDashboard,
    fetchDashboards
};

@connect(mapStateToProps, mapDispatchToProps)
export default class Dashboards extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            dropdownOpen: false,
            modalOpen: false
        };

        this.styles = {
            dashIcon: {
                width: '105px',
                height: '90px',
                backgroundImage: 'url("/app/components/icons/assets/dash_empty_state.svg")',
                backgroundRepeat: 'no-repeat'
            }
        }
    }

    static propTypes = {
        dashboards: PropTypes.array.isRequired,
        createDashboard: PropTypes.func.isRequired,
        fetchDashboards: PropTypes.func.isRequired,
    };

    componentWillMount() {
        this.props.fetchDashboards();
    }

    async onCreateDashboard(newDashboard) {
        let { createDashboard } = this.props;

        try {
            let action = await createDashboard(newDashboard, true);
            // FIXME: this doesn't feel right...
            this.props.onChangeLocation(`/dash/${action.payload.id}`);
        } catch (e) {
            console.log("createDashboard failed", e);
        }

        // close modal and add new dash to our dashboards list
        this.setState({
            dropdownOpen: false,
            modalOpen: false
        });

        MetabaseAnalytics.trackEvent("Dashboard", "Create");
    }

    toggleModal = () => {
        if (!this.state.modalOpen) {
            // when we open our modal we always close the dropdown
            this.setState({
                dropdownOpen: false,
                modalOpen: !this.state.modalOpen
            });
        }
    }

    closeModal = () => {
        this.setState({ modalOpen: false });
    }

    renderCreateDashboardModal() {
        return (
            <Modal>
                <CreateDashboardModal
                    createDashboardFn={this.onCreateDashboard.bind(this)}
                    onClose={this.closeModal} />
            </Modal>
        );
    }

    render() {
        let { dashboards } = this.props;
        let { modalOpen } = this.state;

        // FIXME Remove these development flags prior to reviews and merge
        const simulateEmpty = false;
        if (simulateEmpty) dashboards = [];

        return (
            <LoadingAndErrorWrapper loading={!dashboards} className="relative mx4">
                { modalOpen ? this.renderCreateDashboardModal() : null }
                <div className="flex align-center pt4 pb2">
                    <TitleAndDescription title={ "Dashboards" } />
                    <div className="flex align-center ml-auto">
                        <div
                            className="link flex-align-right px4 cursor-pointer"
                            onClick={this.toggleModal}
                        >
                            <div
                                className="mt1 flex align-center absolute"
                                style={ {right: 40} }
                            >
                                <Icon name="add" size={16}/>
                                <h3 className="ml1">Add to new dashboard</h3>
                            </div>
                        </div>
                    </div>
                </div>
                { dashboards.length === 0 ?
                    <WhatsADashboard button={
                        <a onClick={this.toggleModal} className="Button Button--primary">Create a dashboard</a>
                    }/>
                    : <DashboardList dashboards={dashboards}/>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
