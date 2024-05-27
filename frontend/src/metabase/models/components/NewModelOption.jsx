/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";

import S from "./NewModelOption.module.css";

export default class NewModelOption extends Component {
  state = {
    hover: false,
  };

  render() {
    const { width, image, title, description, ...props } = this.props;
    const { hover } = this.state;

    return (
      <Link
        {...props}
        className={S.linkWrapper}
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
          className={cx(CS.flex, CS.alignCenter, CS.layoutCentered)}
          style={{ height: "160px" }}
        >
          <img
            src={`${image}.png`}
            style={{ width: width ? `${width}px` : "210px" }}
            srcSet={`${image}@2x.png 2x`}
          />
        </div>
        <div
          className={cx(CS.textNormal, CS.mt2, CS.mb2, CS.textParagraph)}
          style={{ lineHeight: "1.25em" }}
        >
          <h2 className={cx(S.modelTitle, { [CS.textBrand]: hover })}>
            {title}
          </h2>
          <p
            className={cx(CS.textMedium, CS.textSmall)}
            style={{ maxWidth: "360px" }}
          >
            {description}
          </p>
        </div>
      </Link>
    );
  }
}
