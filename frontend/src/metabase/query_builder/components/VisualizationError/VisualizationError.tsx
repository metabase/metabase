import cx from "classnames";
import { getIn } from "icepick";
import { t } from "ttag";

import ErrorDetails from "metabase/components/ErrorDetails/ErrorDetails";
import { ErrorMessage } from "metabase/components/ErrorMessage";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { getEngineNativeType } from "metabase/lib/engine";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { VISUALIZATION_SLOW_TIMEOUT } from "../../constants";

import {
  QueryError,
  QueryErrorHeader,
  QueryErrorIcon,
  QueryErrorTitle,
  QueryErrorLink,
  QueryErrorMessage,
  QueryErrorContent,
} from "./VisualizationError.styled";
import { AdminEmail } from "./components";
import { adjustPositions, stripRemarks } from "./utils";

interface VisualizationErrorProps {
  via: Record<string, any>[];
  question: Question;
  duration: number;
  error: any;
  className?: string;
}

export function VisualizationError({
  via,
  question,
  duration,
  error,
  className,
}: VisualizationErrorProps) {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isNative = question && Lib.queryDisplayInfo(question.query()).isNative;
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
          action={<AdminEmail />}
        />
      );
    } else {
      return (
        <ErrorMessage
          className={className}
          type="serverError"
          title={t`We're experiencing server issues`}
          message={t`Try refreshing the page after waiting a minute or two. If the problem persists we'd recommend you contact an admin.`}
          action={<AdminEmail />}
        />
      );
    }
  } else if (error instanceof Error) {
    return (
      <div
        className={cx(
          className,
          QueryBuilderS.QueryError2,
          CS.flex,
          CS.justifyCenter,
        )}
      >
        <div
          className={cx(
            QueryBuilderS.QueryErrorImage,
            QueryBuilderS.QueryErrorImageQueryError,
            CS.mr4,
          )}
        />
        <div className={QueryBuilderS.QueryError2Details}>
          <h1
            className={CS.textBold}
          >{t`There was a problem with this visualization`}</h1>
          <ErrorDetails className={CS.pt2} details={error} />
        </div>
      </div>
    );
  } else if (isNative) {
    // always show errors for native queries
    let processedError = error;
    const origSql = getIn(via, [(via || "").length - 1, "ex-data", "sql"]);
    if (typeof error === "string" && typeof origSql === "string") {
      processedError = adjustPositions(error, origSql);
    }
    if (typeof error === "string") {
      processedError = stripRemarks(processedError);
    }
    const database = question.database();
    const isSql = database && getEngineNativeType(database.engine) === "sql";

    return (
      <QueryError className={className}>
        <QueryErrorContent>
          <QueryErrorHeader>
            <QueryErrorIcon name="warning" />
            <QueryErrorTitle>{t`An error occurred in your query`}</QueryErrorTitle>
          </QueryErrorHeader>
          <QueryErrorMessage>{processedError}</QueryErrorMessage>
          {isSql && showMetabaseLinks && (
            <QueryErrorLink
              href={MetabaseSettings.learnUrl("debugging-sql/sql-syntax")}
            >
              {t`Learn how to debug SQL errors`}
            </QueryErrorLink>
          )}
        </QueryErrorContent>
      </QueryError>
    );
  } else {
    return (
      <div
        className={cx(
          className,
          QueryBuilderS.QueryError2,
          CS.flex,
          CS.justifyCenter,
        )}
      >
        <div
          className={cx(
            QueryBuilderS.QueryErrorImage,
            QueryBuilderS.QueryErrorImageQueryError,
            CS.mr4,
          )}
        />
        <div className={QueryBuilderS.QueryError2Details}>
          <h1
            className={CS.textBold}
          >{t`There was a problem with your question`}</h1>
          <p
            className={QueryBuilderS.QueryErrorMessageText}
          >{t`Most of the time this is caused by an invalid selection or bad input value. Double check your inputs and retry your query.`}</p>
          <ErrorDetails className={CS.pt2} details={error} />
        </div>
      </div>
    );
  }
}
