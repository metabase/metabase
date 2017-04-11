import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalContent from "metabase/components/ModalContent.jsx";

import inflection from "inflection";

export default class DeleteQuestionModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            error: null
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        deleteCardFn: PropTypes.func.isRequired,
        onClose: PropTypes.func
    };

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
            <ModalContent
                title="Delete Question"
                onClose={this.props.onClose}
            >
                <div className="Form-inputs mb4">
                    <p>Are you sure you want to do this?</p>
                    { this.props.card.dashboard_count > 0 ?
                        <p>This question will be deleted from Metabase, and will also be removed from {dashboardCount}.</p>
                    : null }
                </div>

                <div className="Form-actions">
                    <button className="Button Button--danger" onClick={() => this.deleteCard()}>Yes</button>
                    <button className="Button Button--primary ml1" onClick={this.props.onClose}>No</button>
                    {formError}
                </div>
            </ModalContent>
        );
    }
}
