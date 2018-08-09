import React from "react";
import { t } from "c-3po";
import cx from "classnames";

export default class ErrorDetails extends React.Component {
  state = {
    showError: false,
  };
  render() {
    const { details, centered, className } = this.props;
    if (!details) {
      return null;
    }
    return (
      <div className={className}>
        <div className={centered ? "text-centered" : "text-left"}>
          <a
            onClick={() => this.setState({ showError: true })}
            className="link cursor-pointer"
          >{t`Show error details`}</a>
        </div>
        <div
          style={{ display: this.state.showError ? "inherit" : "none" }}
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
}
