import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class QueryButton extends Component {
    static propTypes = {
        icon: PropTypes.any.isRequired,
        text: PropTypes.string.isRequired,
        iconClass: PropTypes.string,
        onClick: PropTypes.func,
        link: PropTypes.string
    };

    render(page) {
        const icon = typeof this.props.icon === 'string' ?
            { name: this.props.icon } :
            this.props.icon;
        return (
            <div className={this.props.className}>
                <a className="DataRefererenceQueryButton flex align-center no-decoration py1" onClick={this.props.onClick} href={this.props.link}>
                    <Icon className={this.props.iconClass} size={20} {...icon} />
                    <span className="DataRefererenceQueryButton-text mx2 text-default text-brand-hover">{this.props.text}</span>
                    <span className="DataRefererenceQueryButton-circle flex-align-right text-brand">
                        <Icon size={8} name="chevronright" />
                    </span>
                </a>
            </div>
        );
    }
}
