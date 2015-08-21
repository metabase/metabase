'use strict';

import Modal from 'metabase/components/Modal.react';

import inflection from "inflection";
import cx from "classnames";

export default class DeleteQuestionModal extends React.Component {
    constructor() {
        super();
        this.state = {
            error: null
        };
    }

    async deleteCard() {
        try {
            await this.props.deleteCardFn(this.props.card);
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
                errorMessage = this.error.errors.data.message;
            }

            // TODO: timeout display?
            formError = (
                <span className="text-error px2">{errorMessage}</span>
            );
        }

        var dashboardCount = this.props.card.dashboard_count + " " + inflection.inflect("dashboard", this.props.card.dashboard_count);

        return (
            <Modal
                title="Delete Question"
                closeFn={this.props.closeFn}
            >
                <div className="Form-inputs mb4">
                    <p>Are you sure you want to do this?</p>
                    <p>This question will be deleted from Metabase, and will also be removed from:</p>
                    <ul>
                        <li>{dashboardCount}</li>
                    </ul>
                </div>

                <div className="Form-actions">
                    <button className="Button Button--danger" onClick={() => this.deleteCard()}>Yes</button>
                    <button className="Button Button--primary ml1" onClick={this.props.closeFn}>No</button>
                    {formError}
                </div>
            </Modal>
        );
    }
}

DeleteQuestionModal.propTypes = {
    card: React.PropTypes.object.isRequired,
    deleteCardFn: React.PropTypes.func.isRequired,
    closeFn: React.PropTypes.func
};
