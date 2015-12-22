import React, { Component, PropTypes } from "react";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.jsx";

export default class Modal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        className: "Modal",
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
        React.unmountComponentAtNode(this._modalElement);
        if (this._modalElement.parentNode) {
            this._modalElement.parentNode.removeChild(this._modalElement);
        }
    }

    handleClickOutside() {
        if (this.props.onClose) {
            this.props.onClose()
        }
    }

    _modalComponent() {
        return (
            <OnClickOutsideWrapper handleClickOutside={this.handleClickOutside.bind(this)}>
                <div className={this.props.className}>
                    {this.props.children}
                </div>
            </OnClickOutsideWrapper>
        );
    }

    _renderPopover() {
        if (this.props.isOpen) {
            // modal is open, lets do this!
            React.render(
                <div className="Modal-backdrop" style={this.props.style}>
                    {this._modalComponent()}
                </div>
            , this._modalElement);
        } else {
            // if the modal isn't open then actively unmount our popover
            React.unmountComponentAtNode(this._modalElement);
        }
    }

    render() {
        return <span />;
    }
}
