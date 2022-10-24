/* eslint-disable react/prop-types */
import React, { Component } from "react";
import cx from "classnames";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";

export default class NewQueryOption extends Component {
  state = {
    hover: false,
  };

  render() {
    const { width, image, title, description, ...props } = this.props;
    const { hover } = this.state;

    return (
      <Link
        {...props}
        className="block no-decoration bg-white p4 align-center bordered rounded cursor-pointer transition-all full-height text-centered"
        style={{
          boxSizing: "border-box",
          boxShadow: hover
            ? `0 3px 8px 0 ${color("text-light")}`
            : `0 1px 3px 0 ${color("text-light")}`,
          minHeight: 340,
        }}
        onMouseOver={() => this.setState({ hover: true })}
        onMouseLeave={() => this.setState({ hover: false })}
      >
        <div
          className="flex align-center layout-centered"
          style={{ height: "160px" }}
        >
          <img
            src={`${image}.png`}
            style={{ width: width ? `${width}px` : "210px" }}
            srcSet={`${image}@2x.png 2x`}
          />
        </div>
        <div
          className="text-normal mt2 mb2 text-paragraph"
          style={{ lineHeight: "1.25em" }}
        >
          <h2 className={cx("transition-all", { "text-brand": hover })}>
            {title}
          </h2>
          <p className="text-medium text-small" style={{ maxWidth: "360px" }}>
            {description}
          </p>
        </div>
      </Link>
    );
  }
}
