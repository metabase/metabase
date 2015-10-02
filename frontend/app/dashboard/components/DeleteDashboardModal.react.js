'use strict';

import ModalContent from "metabase/components/ModalContent.react";

export default class DeleteDashboardModal extends React.Component {
    constructor() {
        super();
        this.state = {
            error: null
        };
    }

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

DeleteDashboardModal.propTypes = {
    dashboard: React.PropTypes.object.isRequired,
    onClose: React.PropTypes.func,
    onDelete: React.PropTypes.func
};
