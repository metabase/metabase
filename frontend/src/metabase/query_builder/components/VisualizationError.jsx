/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import MetabaseSettings from "metabase/lib/settings";
import ErrorMessage from "metabase/components/ErrorMessage";
import ErrorDetails from "metabase/components/ErrorDetails";

const EmailAdmin = () => {
  const adminEmail = MetabaseSettings.adminEmail();
  return (
    adminEmail && (
      <span className="QueryError-adminEmail">
        <a className="no-decoration" href={`mailto:${adminEmail}`}>
          {adminEmail}
        </a>
      </span>
    )
  );
};

class VisualizationError extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showError: false,
    };
  }
  static propTypes = {
    card: PropTypes.object.isRequired,
    duration: PropTypes.number.isRequired,
    error: PropTypes.object.isRequired,
    className: PropTypes.string,
  };

  render() {
    const { card, duration, error, className } = this.props;

    if (error && typeof error.status === "number") {
      // Assume if the request took more than 15 seconds it was due to a timeout
      // Some platforms like Heroku return a 503 for numerous types of errors so we can't use the status code to distinguish between timeouts and other failures.
      if (duration > 15 * 1000) {
        return (
          <ErrorMessage
            className={className}
            type="timeout"
            title={t`Your question took too long`}
            message={t`We didn't get an answer back from your database in time, so we had to stop. You can try again in a minute, or if the problem persists, you can email an admin to let them know.`}
            action={<EmailAdmin />}
          />
        );
      } else {
        return (
          <ErrorMessage
            className={className}
            type="serverError"
            title={t`We're experiencing server issues`}
            message={t`Try refreshing the page after waiting a minute or two. If the problem persists we'd recommend you contact an admin.`}
            action={<EmailAdmin />}
          />
        );
      }
    } else if (
      card &&
      card.dataset_query &&
      card.dataset_query.type === "native"
    ) {
      // always show errors for native queries
      return (
        <div
          className={cx(className, "QueryError flex align-center text-error")}
        >
          <div className="QueryError-iconWrapper">
            <svg
              className="QueryError-icon"
              viewBox="0 0 32 32"
              width="64"
              height="64"
              fill="currentcolor"
            >
              <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z " />
            </svg>
          </div>
          <span className="QueryError-message">{error}</span>
        </div>
      );
    } else {
      return (
        <div className={cx(className, "QueryError2 flex justify-center")}>
          <div className="QueryError-image QueryError-image--queryError mr4" />
          <div className="QueryError2-details">
            <h1 className="text-bold">{t`There was a problem with your question`}</h1>
            <p className="QueryError-messageText">{t`Most of the time this is caused by an invalid selection or bad input value. Double check your inputs and retry your query.`}</p>
            <ErrorDetails className="pt2" details={error} />
          </div>
        </div>
      );
    }
  }
}

export default VisualizationError;
