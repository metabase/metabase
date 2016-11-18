import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";


export default class AddClauseButton extends Component {

    static propTypes = {
        text: PropTypes.string,
        onClick: PropTypes.func
    };

    renderAddIcon() {
        return (
            <IconBorder borderRadius="3px">
                <Icon name="add" size={14} />
            </IconBorder>
        )
    }

    render() {
        const { text, onClick } = this.props;

        const className = "text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
        if (onClick) {
            return (
                <a className={className} onClick={onClick}>
                    {this.renderAddIcon()}
                    { text && <span className="ml1">{text}</span> }
                </a>
            );
        } else {
            return (
                <span className={className}>
                    {this.renderAddIcon()}
                    { text && <span className="ml1">{text}</span> }
                </span>
            );
        }
    }
}
