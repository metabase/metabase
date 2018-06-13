import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalContent from "metabase/components/ModalContent.jsx";
import { t } from "c-3po";
import cx from "classnames";

export default class DeleteDatabaseModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      confirmValue: "",
      error: null,
    };
  }

  static propTypes = {
    database: PropTypes.object.isRequired,
    onClose: PropTypes.func,
    onDelete: PropTypes.func,
  };

  async deleteDatabase() {
    try {
      this.props.onDelete(this.props.database);
      // immediately call on close because database deletion should be non blocking
      this.props.onClose();
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const { database } = this.props;

    let formError;
    if (this.state.error) {
      let errorMessage = t`Server error encountered`;
      if (this.state.error.data && this.state.error.data.message) {
        errorMessage = this.state.error.data.message;
      } else {
        errorMessage = this.state.error.message;
      }

      // TODO: timeout display?
      formError = <span className="text-error px2">{errorMessage}</span>;
    }

    let confirmed = this.state.confirmValue.toUpperCase() === "DELETE";

    return (
      <ModalContent
        title={t`Delete this database?`}
        onClose={this.props.onClose}
      >
        <div className="Form-inputs mb4">
          {database.is_sample && (
            <p className="text-paragraph">{t`<strong>Just a heads up:</strong> without the Sample Dataset, the Query Builder tutorial won't work. You can always restore the Sample Dataset, but any questions you've saved using this data will be lost.`}</p>
          )}
          <p className="text-paragraph">
            {t`All saved questions, metrics, and segments that rely on this database will be lost.`}{" "}
            <strong>{t`This cannot be undone.`}</strong>
          </p>
          <p className="text-paragraph">
            {t`If you're sure, please type`} <strong>{t`DELETE`}</strong>{" "}
            {t`in this box:`}
          </p>
          <input
            className="Form-input"
            type="text"
            onChange={e => this.setState({ confirmValue: e.target.value })}
            autoFocus
          />
        </div>

        <div className="Form-actions ml-auto">
          <button
            className="Button"
            onClick={this.props.onClose}
          >{t`Cancel`}</button>
          <button
            className={cx("Button Button--danger ml2", {
              disabled: !confirmed,
            })}
            onClick={() => this.deleteDatabase()}
          >{t`Delete`}</button>
          {formError}
        </div>
      </ModalContent>
    );
  }
}
