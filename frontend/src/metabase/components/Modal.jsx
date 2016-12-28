import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import cx from "classnames";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";
import { Motion, spring } from "react-motion";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.jsx";
import ModalContent from "./ModalContent";

import _ from "underscore";

export const MODAL_CHILD_CONTEXT_TYPES = {
    fullPageModal: PropTypes.bool,
    formModal: PropTypes.bool
};

function getModalContent(props) {
    if (React.Children.count(props.children).length > 1 ||
        props.title != null || props.footer != null
    ) {
        return <ModalContent {..._.omit(props, "className", "style")} />
    } else {
        return React.Children.only(props.children);
    }
}

export class WindowModal extends Component {
    static propTypes = {
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        className: "Modal",
        backdropClassName: "Modal-backdrop"
    };

    static childContextTypes = MODAL_CHILD_CONTEXT_TYPES;

    getChildContext() {
        return {
            fullPageModal: false,
            formModal: !!this.props.form
        };
    }

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
        const className = cx(this.props.className, ...["small", "medium", "wide", "tall"].filter(type => this.props[type]).map(type => `Modal--${type}`))
        return (
            <OnClickOutsideWrapper handleDismissal={this.handleDismissal.bind(this)}>
                <div className={cx(className, 'relative bordered bg-white rounded')}>
                    {getModalContent(this.props)}
                </div>
            </OnClickOutsideWrapper>
        );
    }

    _renderPopover() {
        const { backdropClassName, isOpen, style } = this.props;
        const backdropClassnames = 'flex justify-center align-center fixed top left bottom right';
        ReactDOM.unstable_renderSubtreeIntoContainer(this,
            <ReactCSSTransitionGroup transitionName="Modal" transitionAppear={true} transitionAppearTimeout={250} transitionEnterTimeout={250} transitionLeaveTimeout={250}>
                { isOpen &&
                    <div key="modal" className={cx(backdropClassName, backdropClassnames)} style={style}>
                        {this._modalComponent()}
                    </div>
                }
            </ReactCSSTransitionGroup>
        , this._modalElement);
    }

    render() {
        return null;
    }
}

export class FullPageModal extends Component {
    static childContextTypes = MODAL_CHILD_CONTEXT_TYPES;

    getChildContext() {
        return {
            fullPageModal: true,
            formModal: !!this.props.form
        };
    }

    componentDidMount() {
        let nav = document.body.querySelector(".Nav");
        this._sibling = nav.nextSibling;
        this._siblingPosition = nav.nextSibling.style.position;
        this._siblingZIndex = nav.nextSibling.style.zIndex;
        this._sibling.style.position = "absolute";
        this._sibling.style.zIndex = -1;

        this._modalElement = document.createElement("div");
        this._modalElement.className = "Modal--full flex-full relative bg-white ";
        nav.parentNode.appendChild(this._modalElement);

        this.componentDidUpdate();

        this._scrollX = window.scrollX;
        this._scrollY = window.scrollY;
        window.scrollTo(0,0);

        this._documentBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    }

    componentDidUpdate() {
        this._renderModal(true)
    }

    componentWillUnmount() {
        this._renderModal(false);
        setTimeout(() => {
            ReactDOM.unmountComponentAtNode(this._modalElement);
            this._modalElement.parentNode.removeChild(this._modalElement);
            this._sibling.style.position = this._siblingPosition;
            this._sibling.style.zIndex = this._siblingZIndex;
            document.body.style.overflow = this._documentBodyOverflow;
            window.scrollTo(this._scrollX, this._scrollY);
        }, 300);
    }

    _renderModal(open) {
        ReactDOM.unstable_renderSubtreeIntoContainer(this,
            <Motion defaultStyle={{ opacity: 0, top: 20 }} style={open ?
                { opacity: spring(1), top: spring(0) } :
                { opacity: spring(0), top: spring(20) }
            }>
                { motionStyle =>
                    <div className="full-height relative" style={motionStyle}>
                    { getModalContent(this.props) }
                    </div>
                }
            </Motion>
        , this._modalElement);
    }

    render() {
        return null;
    }
}

export class InlineModal extends Component {
    static childContextTypes = MODAL_CHILD_CONTEXT_TYPES;

    getChildContext() {
        return {
            fullPageModal: true,
            formModal: !!this.props.form
        };
    }

    render() {
        const { isOpen } = this.props;
        return (
            <Motion defaultStyle={{ opacity: 0, top: 20 }} style={isOpen ?
                { opacity: spring(1), top: spring(0) } :
                { opacity: spring(0), top: spring(20) }
            }>
                { motionStyle =>
                    <div className="full-height relative" style={motionStyle}>
                    { getModalContent(this.props) }
                    </div>
                }
            </Motion>
        )
    }
}


const Modal = ({ full, inline, ...props }) =>
    full ?
        (props.isOpen ? <FullPageModal {...props} /> : null)
    : inline ?
        <InlineModal {...props} />
    :
        <WindowModal {...props} />;

Modal.defaultProps = {
    isOpen: true,
};

export default Modal;
