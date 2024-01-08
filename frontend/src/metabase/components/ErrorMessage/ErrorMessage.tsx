import cx from "classnames";
import type { ReactNode } from "react";

// NOTE: currently relies on .QueryError CSS selectors residing in query_builder.css
interface ErrorMessageProps {
  title: string;
  type: string;
  message: string;
  action: ReactNode;
  className?: string;
}

export const ErrorMessage = ({
  title,
  type,
  message,
  action,
  className,
}: ErrorMessageProps) => {
  return (
    <div className={cx(className, "QueryError flex align-center")}>
      <div className={`QueryError-image QueryError-image--${type}`} />
      <div className="QueryError-message text-centered">
        {title && <h1 className="text-bold">{title}</h1>}
        <p className="QueryError-messageText">{message}</p>
        {action}
      </div>
    </div>
  );
};
