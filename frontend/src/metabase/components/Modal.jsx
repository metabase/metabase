import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.jsx";

export default class Modal extends Component {
    static propTypes = {
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        className: "Modal",
        backdropClassName: "Modal-backdrop",
        isOpen: true
    };

    componentWillMount() {
        this._modalElement = document.createElement('span');
        this._modalElement.className = 'ModalContainer';
        this._modalElement.id = Math.floor((Math.random() * 698754) + 1);
        document.querySelector('body').appendChild(this._modalElement);
    }

    componentDidMount() {
        this._renderPopover();
    }

    componentDidUpdate() {
        this._renderPopover();
    }

    componentWillUnmount() {
        ReactDOM.unmountComponentAtNode(this._modalElement);
        if (this._modalElement.parentNode) {
            this._modalElement.parentNode.removeChild(this._modalElement);
        }
    }

    handleDismissal() {
        if (this.props.onClose) {
            this.props.onClose()
        }
    }

    _modalComponent() {
        return (
            <OnClickOutsideWrapper handleDismissal={this.handleDismissal.bind(this)}>
                <div className={this.props.className}>
                    {this.props.children}
                </div>
            </OnClickOutsideWrapper>
        );
    }

    _renderPopover() {
        ReactDOM.render(
            <ReactCSSTransitionGroup transitionName="Modal" transitionAppear={true} transitionAppearTimeout={250} transitionEnterTimeout={250} transitionLeaveTimeout={250}>
                { this.props.isOpen &&
                    <div key="modal" className={this.props.backdropClassName} style={this.props.style}>
                        {this._modalComponent()}
                    </div>
                }
            </ReactCSSTransitionGroup>
        , this._modalElement);
    }

    render() {
        return <span />;
    }
}
