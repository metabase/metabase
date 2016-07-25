import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class QueryButton extends Component {
    static propTypes = {
        icon: PropTypes.string.isRequired,
        text: PropTypes.string.isRequired,
        onClick: PropTypes.func,
        link: PropTypes.string
    };

    render(page) {
        return (
            <div className={this.props.className}>
                <a className="DataRefererenceQueryButton flex align-center no-decoration py1" onClick={this.props.onClick} href={this.props.link}>
                    <Icon name={this.props.icon} />
                    <span className="DataRefererenceQueryButton-text mx2 text-default text-brand-hover">{this.props.text}</span>
                    <span className="DataRefererenceQueryButton-circle flex-align-right text-brand">
                        <Icon size={8} name="chevronright" />
                    </span>
                </a>
            </div>
        );
    }
}
