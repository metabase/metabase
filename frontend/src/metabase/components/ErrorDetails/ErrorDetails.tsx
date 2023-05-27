import React, { useState } from "react";
import { t } from "ttag";
import cx from "classnames";

import { ErrorDetailsProps } from "./types";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ErrorDetails({
  details,
  centered,
  className,
}: ErrorDetailsProps) {
  const [showError, setShowError] = useState(false);

  if (!details) {
    return null;
  }

  function toggleShowError() {
    setShowError(showError => !showError);
  }

  return (
    <div className={className}>
      <div className={centered ? "text-centered" : "text-left"}>
        <a onClick={toggleShowError} className="link cursor-pointer">
          {showError ? t`Hide error details` : t`Show error details`}
        </a>
      </div>
      <div
        style={{ display: showError ? "inherit" : "none" }}
        className={cx("pt3", centered ? "text-centered" : "text-left")}
      >
        <h2>{t`Here's the full error message`}</h2>
        <div
          style={{ fontFamily: "monospace" }}
          className="QueryError2-detailBody bordered rounded bg-light text-bold p2 mt1"
        >
          {/* ensure we don't try to render anything except a string */}
          {typeof details === "string"
            ? details
            : typeof details.message === "string"
            ? details.message
            : String(details)}
        </div>
      </div>
    </div>
  );
}
