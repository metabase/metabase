'use strict';

import FormField from "metabase/components/FormField.react";
import Icon from "metabase/components/Icon.react";
import Modal from 'metabase/components/Modal.react';

import inflection from "inflection";
import cx from "classnames";

export default React.createClass({
    displayName: "DeleteQuestionModal",
    propTypes: {
        card: React.PropTypes.object.isRequired,
        deleteCardFn: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func
    },

    getInitialState: function () {
        return {
            errors: null
        };
    },

    deleteCard: function(event) {
        this.props.deleteCardFn(this.props.card).then(null, (error) => {
            this.setState({
                errors: error
            });
        });
    },

    render: function() {
        var formError;
        if (this.state.errors) {
            var errorMessage = "Server error encountered";
            if (this.state.errors.data &&
                this.state.errors.data.message) {
                errorMessage = this.state.errors.data.message;
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
                    <button className="Button Button--danger" onClick={this.deleteCard}>Yes</button>
                    <button className="Button Button--primary ml1" onClick={this.props.closeFn}>No</button>
                    {formError}
                </div>
            </Modal>
        );
    }
});
