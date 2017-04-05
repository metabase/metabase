import React, { Component, PropTypes } from 'react';
import { connect } from "react-redux";
import { Link } from "react-router";

import MetabaseAnalytics from "metabase/lib/analytics";
import CreateDashboardModal from "metabase/components/CreateDashboardModal.jsx";
import Modal from "metabase/components/Modal.jsx";

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
            <div>
                { modalOpen ? this.renderCreateDashboardModal() : null }
                <div>
                    { dashboards.length === 0 ?
                        <div>
                            <div>
                                <div style={this.styles.dashIcon} />
                            </div>
                            <div>You don’t have any dashboards yet.</div>
                            <div>Dashboards group visualizations for frequent questions in a single
                                handy place.
                            </div>
                            <div>
                                <a onClick={this.toggleModal}>Create
                                    your first dashboard</a>
                            </div>
                        </div>
                        :
                        <ul>
                            { dashboards.map(dash =>
                                <li key={dash.id}>
                                    <Link to={"/dash/" + dash.id}
                                          data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dash.id}>
                                        <div>
                                            {dash.name}
                                        </div>
                                        { dash.description ?
                                            <div>
                                                {dash.description}
                                            </div>
                                            : null }
                                    </Link>
                                </li>
                            )}
                            <li>
                                <a data-metabase-event={"Navbar;Dashboards;Create Dashboard"}
                                    onClick={this.toggleModal}>
                                    Create a new dashboard</a>
                            </li>
                        </ul>
                    }
                </div>
            </div>
        );
    }
}
