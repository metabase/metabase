import React, { Component, PropTypes } from "react";

import ModalContent from "metabase/components/ModalContent.jsx";

export default class DeleteDashboardModal extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null
        };
    }

    static propTypes = {
        dashboard: PropTypes.object.isRequired,

        onClose: PropTypes.func,
        onDelete: PropTypes.func
    };

    async deleteDashboard() {
        try {
            this.props.onDelete(this.props.dashboard);
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {
        var formError;
        if (this.state.error) {
            var errorMessage = "Server error encountered";
            if (this.state.error.data &&
                this.state.error.data.message) {
                errorMessage = this.state.error.data.message;
            } else {
                errorMessage = this.state.error.message;
            }

            // TODO: timeout display?
            formError = (
                <span className="text-error px2">{errorMessage}</span>
            );
        }

        return (
            <ModalContent
                title="Delete Dashboard"
                closeFn={this.props.onClose}
            >
                <div className="Form-inputs mb4">
                    <p>Are you sure you want to do this?</p>
                </div>

                <div className="Form-actions">
                    <button className="Button Button--danger" onClick={() => this.deleteDashboard()}>Yes</button>
                    <button className="Button Button--primary ml1" onClick={this.props.onClose}>No</button>
                    {formError}
                </div>
            </ModalContent>
        );
    }
}
