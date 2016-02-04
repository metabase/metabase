import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class ModalContent extends Component {
    static propTypes = {
        title: PropTypes.string.isRequired,
        closeFn: PropTypes.func.isRequired
    };

    static defaultProps = {
        className: "Modal-content NewForm"
    };

    render() {
        return (
            <div className={this.props.className}>
                <div className="Modal-header Form-header flex align-center">
                    <h2 className="flex-full">{this.props.title}</h2>
                    <a className="text-grey-3 p1" onClick={this.props.closeFn}>
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
