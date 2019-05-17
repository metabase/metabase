import React, { Component } from "react";

import BodyComponent from "metabase/components/BodyComponent";
import cx from "classnames";
import { t } from "ttag";

@BodyComponent
export default class HeaderModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      initialTop: "-100%",
    };
  }

  componentDidMount() {
    this.setState({ initialTop: 0 });
  }

  render() {
    const { className, height, title, onDone, onCancel, isOpen } = this.props;
    const { initialTop } = this.state;
    return (
      <div
        className={cx(
          className,
          "absolute top left right bg-brand flex flex-column layout-centered",
        )}
        style={{
          zIndex: 4,
          height: height,
          minHeight: 50,
          transform: `translateY(${isOpen ? initialTop : "-100%"})`,
          transition: "transform 400ms ease-in-out",
          overflow: "hidden",
        }}
      >
        <h2 className="text-white pb2">{title}</h2>
        <div className="flex layout-centered">
          <button
            className="Button Button--borderless text-brand bg-white text-bold"
            onClick={onDone}
          >{t`Done`}</button>
          {onCancel && <span className="text-white mx1">or</span>}
          {onCancel && (
            <a
              className="cursor-pointer text-white text-bold"
              onClick={onCancel}
            >{t`Cancel`}</a>
          )}
        </div>
      </div>
    );
  }
}
