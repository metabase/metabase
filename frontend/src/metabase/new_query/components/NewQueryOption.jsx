import React, { Component } from "react";
import cx from "classnames";
import { Link } from "react-router";
import colors from "metabase/lib/colors";

export default class NewQueryOption extends Component {
  props: {
    image: string,
    title: string,
    description: string,
    to: string,
  };

  state = {
    hover: false,
  };

  render() {
    const { width, image, title, description, to } = this.props;
    const { hover } = this.state;

    return (
      <Link
        className="block no-decoration bg-white px3 pt4 align-center bordered rounded cursor-pointer transition-all text-centered"
        style={{
          boxSizing: "border-box",
          boxShadow: hover
            ? `0 3px 8px 0 ${colors["text-light"]}`
            : `0 1px 3px 0 ${colors["text-light"]}`,
          height: 340,
        }}
        onMouseOver={() => this.setState({ hover: true })}
        onMouseLeave={() => this.setState({ hover: false })}
        to={to}
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
          <p className={"text-medium text-small"}>{description}</p>
        </div>
      </Link>
    );
  }
}
