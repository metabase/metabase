import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalContent from "metabase/components/ModalContent.jsx";

import cx from "classnames";

export default class DeleteDatabaseModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            confirmValue: "",
            error: null
        };
    }

    static propTypes = {
        database: PropTypes.object.isRequired,
        onClose: PropTypes.func,
        onDelete: PropTypes.func
    };

    async deleteDatabase() {
        try {
            this.props.onDelete(this.props.database);
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {
        const { database } = this.props;

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

        let confirmed = this.state.confirmValue.toUpperCase() === "DELETE";

        return (
            <ModalContent
                title="Delete Database"
                onClose={this.props.onClose}
            >
                <div className="Form-inputs mb4">
                    { database.is_sample &&
                        <p><strong>Just a heads up:</strong> without the Sample Dataset, the Query Builder tutorial won't work. You can always restore the Sample Dataset, though.</p>
                    }
                    <p>
                        Are you sure you want to delete this database? All saved questions that rely on this database will be lost. <strong>This cannot be undone</strong>. If you're sure, please type <strong>DELETE</strong> in this box:
                    </p>
                    <input className="Form-input" type="text" onChange={(e) => this.setState({ confirmValue: e.target.value })} autoFocus />
                </div>

                <div className="Form-actions">
                    <button className={cx("Button Button--danger", { "disabled": !confirmed })} onClick={() => this.deleteDatabase()}>Delete</button>
                    <button className="Button Button--primary ml1" onClick={this.props.onClose}>Cancel</button>
                    {formError}
                </div>
            </ModalContent>
        );
    }
}
