/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import Icon from "metabase/components/Icon.jsx";

export default class CollapsedStep extends Component {
  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    stepCircleText: PropTypes.string.isRequired,
    stepText: PropTypes.string.isRequired,
    setActiveStep: PropTypes.func.isRequired,
    isCompleted: PropTypes.bool.isRequired,
  };

  gotoStep() {
    if (this.props.isCompleted) {
      this.props.setActiveStep(this.props.stepNumber);
    }
  }

  render() {
    let { isCompleted, stepCircleText, stepText } = this.props;

    const classes = cx({
      SetupStep: true,
      rounded: true,
      full: true,
      relative: true,
      "bg-white": true,
      "SetupStep--completed shadowed": isCompleted,
      "SetupStep--todo": !isCompleted,
    });

    return (
      <section className={classes}>
        <div className="flex align-center py2">
          <span className="SetupStep-indicator flex layout-centered absolute bordered">
            <span className="SetupStep-number">{stepCircleText}</span>
            <Icon name={"check"} className="SetupStep-check" size={16} />
          </span>
          <h3
            className="SetupStep-title ml4 my1"
            onClick={this.gotoStep.bind(this)}
          >
            {stepText}
          </h3>
        </div>
      </section>
    );
  }
}
