import React, { Component, PropTypes } from "react";
import cx from "classnames";
import Icon from "metabase/components/Icon.jsx";
import { setActiveStep } from "../actions";


export default class SetupCollapsedStep extends Component {
    static propTypes = {
        stepNumber: PropTypes.number.isRequired,
        stepText: PropTypes.string.isRequired,
        isCompleted: PropTypes.bool.isRequired
    }

    gotoStep() {
        if (this.props.isCompleted) {
            this.props.dispatch(setActiveStep(this.props.stepNumber));
        }
    }

    render() {
        let { isCompleted, stepNumber, stepText } = this.props;

        const classes = cx({
            'SetupStep': true,
            'rounded': true,
            'full': true,
            'relative': true,
            'SetupStep--completed shadowed': isCompleted,
            'SetupStep--todo': !isCompleted
        });

        return (
            <section className={classes}>
                <div className="flex align-center py2">
                    <span className="SetupStep-indicator flex layout-centered absolute bordered">
                        <span className="SetupStep-number">{stepNumber}</span>
                        <Icon name={'check'} className="SetupStep-check" width={16} height={16}></Icon>
                    </span>
                    <h3 className="SetupStep-title ml4 my1" onClick={this.gotoStep.bind(this)}>{stepText}</h3>
                </div>
            </section>
        );
    }
}
