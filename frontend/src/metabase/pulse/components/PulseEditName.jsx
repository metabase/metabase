/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import _ from "underscore";
import cx from "classnames";

export default class PulseEditName extends Component {
  constructor(props) {
    super(props);

    this.state = {
      valid: true,
    };

    this.name = React.createRef();

    _.bindAll(this, "setName", "validate");
  }

  static propTypes = {};
  static defaultProps = {};

  setName(e) {
    const { pulse } = this.props;
    this.props.setPulse({ ...pulse, name: e.target.value });
  }

  validate() {
    this.setState({ valid: !!this.name.current.value });
  }

  render() {
    const { pulse } = this.props;
    return (
      <div className="py1">
        <h2>{t`Name your pulse`}</h2>
        <p className="mt1 h4 text-bold text-medium">
          {t`Give your pulse a name to help others understand what it's about`}.
        </p>
        <div className="my3">
          <input
            ref={this.name}
            className={cx("input text-bold", {
              "border-error": !this.state.valid,
            })}
            style={{ width: "400px" }}
            value={pulse.name || ""}
            onChange={this.setName}
            onBlur={this.name.current && this.validate}
            placeholder={t`Important metrics`}
            autoFocus
          />
        </div>
      </div>
    );
  }
}
