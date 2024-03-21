import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { NoRowsError } from "metabase/query_builder/components/errors/NowRowsError";

interface ErrorMessageProps {
  title: string;
  type: "timeout" | "serverError" | "noRows";
  message: string;
  action: ReactNode;
  className?: string;
}

// NOTE: currently relies on .QueryError CSS selectors residing in query_builder.css
export const ErrorMessage = ({
  title,
  type,
  message,
  action,
  className,
}: ErrorMessageProps) => {
  return (
    <div
      className={cx(
        className,
        QueryBuilderS.QueryError,
        CS.flex,
        CS.alignCenter,
      )}
    >
      {type === "noRows" ? (
        <NoRowsError mb="1rem" />
      ) : (
        <div
          className={cx(QueryBuilderS.QueryErrorImage, {
            [QueryBuilderS.QueryErrorImageServerError]: type === "serverError",
            [QueryBuilderS.QueryErrorImageTimeout]: type === "timeout",
          })}
        />
      )}
      <div className="text-centered">
        {title && <h1 className="text-bold">{title}</h1>}
        <p className={QueryBuilderS.QueryErrorMessageText}>{message}</p>
        {action}
      </div>
    </div>
  );
};
