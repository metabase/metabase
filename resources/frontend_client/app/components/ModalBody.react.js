"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

export default class ModalBody extends Component {
    render() {
        return (
            <div className="Modal-body NewForm">
                <div className="Form-header flex align-center">
                    <h2 className="flex-full">{this.props.title}</h2>
                    <a href="#" className="text-grey-3 p1" onClick={this.props.closeFn}>
                        <Icon name='close' width="16px" height="16px"/>
                    </a>
                </div>
                <div>
                    {this.props.children}
                </div>
            </div>
        );
    }
}

ModalBody.propTypes = {
    title: PropTypes.string.isRequired,
    closeFn: PropTypes.func.isRequired
};
