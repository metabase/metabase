import React, { Component, PropTypes } from "react";

import TimeoutTransitionGroup from "react-components/timeout-transition-group";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.jsx";

export default class Modal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isOpen: false
        };
    }

    static propTypes = {
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        className: "Modal",
        isOpen: true
    };

    componentWillReceiveProps(nextProps) {
        this.setState({
            isOpen: nextProps.isOpen
        });
    }

    componentWillMount() {
        this._modalElement = document.createElement('span');
        this._modalElement.className = 'ModalContainer';
        this._modalElement.id = Math.floor((Math.random() * 698754) + 1);
        document.querySelector('body').appendChild(this._modalElement);

        // HACK: TimeoutTransitionGroup doesn't support "appear" transition
        // NOTE: Use "appear" transition in ReactCSSTransitionGroup once upgraded to React 0.14+
        setTimeout(() => this.setState({ isOpen: this.props.isOpen }), 1);
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
        React.render(
            <TimeoutTransitionGroup transitionName="Modal" enterTimeout={250} leaveTimeout={250}>
                { this.state.isOpen &&
                    <div key="modal" className="Modal-backdrop" style={this.props.style}>
                        {this._modalComponent()}
                    </div>
                }
            </TimeoutTransitionGroup>
        , this._modalElement);
    }

    render() {
        return <span />;
    }
}
