import React, { Component, PropTypes } from 'react'
import Icon from "metabase/components/Icon.jsx";

export default class StepTitle extends Component {
    static propTypes = {
        number: PropTypes.number.isRequired,
        title: PropTypes.string.isRequired
    };

    render() {
        const { number, title } = this.props;
        return (
            <div className="flex align-center pt3 pb1">
                <span className="SetupStep-indicator flex layout-centered absolute bordered">
                    <span className="SetupStep-number">{number}</span>
                    <Icon name={'check'} className="SetupStep-check" width={16} height={16}></Icon>
                </span>
                <h3 style={{marginTop: 10}} className="SetupStep-title Form-offset">{title}</h3>
            </div>
        );
    }
}
