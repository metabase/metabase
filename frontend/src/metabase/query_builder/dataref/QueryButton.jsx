import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

//TODO: move this into shared components and refactor to use css modules
export default class QueryButton extends Component {
    static propTypes = {
        icon: PropTypes.any.isRequired,
        text: PropTypes.string.isRequired,
        secondaryText: PropTypes.string,
        secondaryOnClick: PropTypes.func,
        iconClass: PropTypes.string,
        onClick: PropTypes.func,
        link: PropTypes.string
    };

    render(page) {
        const {
            className,
            text,
            secondaryText,
            secondaryOnClick,
            iconClass,
            onClick,
            link,
        } = this.props;

        const icon = typeof this.props.icon === 'string' ?
            { name: this.props.icon } :
            this.props.icon;

        return (
            <div className={className}>
                <a className="DataRefererenceQueryButton flex align-center no-decoration py1" onClick={onClick} href={link}>
                    <Icon className={iconClass} size={20} {...icon} />
                    <span
                        className="DataRefererenceQueryButton-text flex-full mx2 text-default text-brand-hover"
                        style={secondaryText ? {
                            flexGrow: 0.35,
                            fontSize: "16px",
                            color: "#509EE3"
                        } : {}}
                    >
                        {text}
                    </span>
                    { secondaryText &&
                        <span
                            className="DataRefererenceQueryButton-text flex-full mx2 text-default text-brand-hover"
                            onClick={secondaryOnClick}
                            style={{flexGrow: 0.65}}
                        >
                            {secondaryText}
                        </span>
                    }
                    <span className="DataRefererenceQueryButton-circle text-brand">
                        <Icon size={8} name="chevronright" />
                    </span>
                </a>
            </div>
        );
    }
}
