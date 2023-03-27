/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { getIn } from "icepick";
import cx from "classnames";

import MetabaseSettings from "metabase/lib/settings";
import ErrorMessage from "metabase/components/ErrorMessage";
import ErrorDetails from "metabase/components/ErrorDetails/ErrorDetails";
import { VISUALIZATION_SLOW_TIMEOUT } from "../constants";
import {
  QueryError,
  QueryErrorHeader,
  QueryErrorIcon,
  QueryErrorTitle,
  QueryErrorLink,
  QueryErrorMessage,
  QueryErrorContent,
} from "./VisualizationError.styled";

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

export function adjustPositions(error, origSql) {
  /* Positions in error messages are borked coming in for Postgres errors.
   * Previously, you would see "blahblahblah bombed out, Position: 119" in a 10-character invalid query.
   * This is because MB shoves in 'remarks' into the original query and we get the exception from the query with remarks.
   * This function adjusts the value of the positions in the exception message to account for this.
   * This is done in mildly scary kludge here in frontend after everything,
   * because the alternative of doing it in backend
   * is an absolutely terrifying kludge involving messing with exceptions.
   */
  let adjustmentLength = 0;

  // redshift remarks use c-style multiline comments...
  const multiLineBeginPos = origSql.search("/\\*");
  const multiLineEndPos = origSql.search("\\*/");
  // if multiLineBeginPos is 0 then we know it's a redshift remark
  if (multiLineBeginPos === 0 && multiLineEndPos !== -1) {
    adjustmentLength += multiLineEndPos + 2; // 2 for */ in itself
  }

  const chompedSql = origSql.substr(adjustmentLength);
  // there also seem to be cases where remarks don't get in...
  const commentPos = chompedSql.search("--");
  const newLinePos = chompedSql.search("\n");
  // 5 is a heuristic: this indicates that this is almost certainly an initial remark comment
  if (commentPos !== -1 && commentPos < 5) {
    // There will be a \n after the redshift comment,
    // which is why there needs to be a 2 added
    adjustmentLength += newLinePos + 2;
  }

  return error.replace(/Position: (\d+)/, function (_, p1) {
    return "Position: " + (parseInt(p1) - adjustmentLength);
  });
}

export function stripRemarks(error) {
  /* SQL snippets in error messages are borked coming in for errors in many DBs.
   * You're expecting something with just your sql in the message,
   * but the whole error contains these remarks that MB added in. Confusing!
   */
  return error.replace(
    /-- Metabase:: userID: \d+ queryType: native queryHash: \w+\n/,
    "",
  );
}

class VisualizationError extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showError: false,
    };
  }
  static propTypes = {
    via: PropTypes.object.isRequired,
    question: PropTypes.object.isRequired,
    duration: PropTypes.number.isRequired,
    error: PropTypes.object.isRequired,
    className: PropTypes.string,
  };

  render() {
    const { via, question, duration, error, className } = this.props;
    console.error(error);

    if (error && typeof error.status === "number") {
      // Assume if the request took more than 15 seconds it was due to a timeout
      // Some platforms like Heroku return a 503 for numerous types of errors so we can't use the status code to distinguish between timeouts and other failures.
      if (duration > VISUALIZATION_SLOW_TIMEOUT) {
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
    } else if (error instanceof Error) {
      return (
        <div className={cx(className, "QueryError2 flex justify-center")}>
          <div className="QueryError-image QueryError-image--queryError mr4" />
          <div className="QueryError2-details">
            <h1 className="text-bold">{t`There was a problem with this visualization`}</h1>
            <ErrorDetails className="pt2" details={error} />
          </div>
        </div>
      );
    } else if (question?.isNative()) {
      // always show errors for native queries
      let processedError = error;
      const origSql = getIn(via, [(via || "").length - 1, "ex-data", "sql"]);
      if (typeof error === "string" && typeof origSql === "string") {
        processedError = adjustPositions(error, origSql);
      }
      if (typeof error === "string") {
        processedError = stripRemarks(processedError);
      }
      return (
        <QueryError className={className}>
          <QueryErrorContent>
            <QueryErrorHeader>
              <QueryErrorIcon name="warning" />
              <QueryErrorTitle>{t`An error occurred in your query`}</QueryErrorTitle>
            </QueryErrorHeader>
            <QueryErrorMessage>{processedError}</QueryErrorMessage>
            <QueryErrorLink
              href={MetabaseSettings.learnUrl("debugging-sql/sql-syntax")}
            >
              {t`Learn how to debug SQL errors`}
            </QueryErrorLink>
          </QueryErrorContent>
        </QueryError>
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
