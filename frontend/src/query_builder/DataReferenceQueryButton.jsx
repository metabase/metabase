import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class DataReferenceQueryButton extends Component {
    static propTypes = {
        icon: PropTypes.string.isRequired,
        text: PropTypes.string.isRequired,
        onClick: PropTypes.func
    };

    render(page) {
        return (
            <div className={this.props.className}>
                <a className="DataRefererenceQueryButton flex align-center no-decoration py1" onClick={this.props.onClick} >
                    <Icon name={this.props.icon} />
                    <span className="DataRefererenceQueryButton-text mx2 text-default text-brand-hover">{this.props.text}</span>
                    <span className="DataRefererenceQueryButton-circle flex-align-right text-brand">
                        <Icon width="8" height="8" name="chevronright" />
                    </span>
                </a>
            </div>
        );
    }
}
