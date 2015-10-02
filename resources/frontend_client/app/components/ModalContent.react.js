"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

export default class ModalContent extends Component {
    render() {
        return (
            <div className={this.props.className}>
                <div className="Modal-header Form-header flex align-center">
                    <h2 className="flex-full">{this.props.title}</h2>
                    <a href="#" className="text-grey-3 p1" onClick={this.props.closeFn}>
                        <Icon name='close' width="16px" height="16px"/>
                    </a>
                </div>
                <div className="Modal-body">
                    {this.props.children}
                </div>
            </div>
        );
    }
}

ModalContent.defaultProps = {
    className: "Modal-content NewForm"
};

ModalContent.propTypes = {
    title: PropTypes.string.isRequired,
    closeFn: PropTypes.func.isRequired
};
