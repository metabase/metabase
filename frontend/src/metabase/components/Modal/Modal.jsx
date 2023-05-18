/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { CSSTransition, TransitionGroup } from "react-transition-group";
import { Motion, spring } from "react-motion";
import _ from "underscore";
import { getScrollX, getScrollY } from "metabase/lib/dom";

import SandboxedPortal from "metabase/components/SandboxedPortal";
import routeless from "metabase/hoc/Routeless";
import ModalContent from "metabase/components/ModalContent";
import { MaybeOnClickOutsideWrapper } from "metabase/components/Modal/MaybeOnClickOutsideWrapper";

function getModalContent(props) {
  if (
    React.Children.count(props.children) > 1 ||
    props.title != null ||
    props.footer != null
  ) {
    return <ModalContent {..._.omit(props, "className", "style")} />;
  } else {
    return React.Children.only(props.children);
  }
}

export class WindowModal extends Component {
  static propTypes = {
    isOpen: PropTypes.bool,
    enableMouseEvents: PropTypes.bool,
    enableTransition: PropTypes.bool,
    noOnClickOutsideWrapper: PropTypes.bool,
  };

  static defaultProps = {
    className: "Modal",
    backdropClassName: "Modal-backdrop",
    enableTransition: true,
  };

  constructor(props) {
    super(props);

    this._modalElement = document.createElement("div");
    this._modalElement.className = "ModalContainer";
    document.body.appendChild(this._modalElement);
  }

  componentWillUnmount() {
    this._modalElement.parentNode.removeChild(this._modalElement);
  }

  handleDismissal = () => {
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  _modalComponent() {
    const className = cx(
      this.props.className,
      ...["small", "medium", "wide", "tall", "fit"]
        .filter(type => this.props[type])
        .map(type => `Modal--${type}`),
    );
    return (
      <MaybeOnClickOutsideWrapper
        noOnClickOutsideWrapper={this.props.noOnClickOutsideWrapper}
        backdropElement={this._modalElement}
        handleDismissal={this.handleDismissal}
      >
        <div
          className={cx(className, "relative bg-white rounded")}
          role="dialog"
        >
          {getModalContent({
            ...this.props,
            fullPageModal: false,
            // if there is a form then its a form modal, or if there's a form
            // modal prop use that
            formModal: !!this.props.form || this.props.formModal,
          })}
        </div>
      </MaybeOnClickOutsideWrapper>
    );
  }

  render() {
    const {
      enableMouseEvents,
      backdropClassName,
      isOpen,
      style,
      enableTransition,
    } = this.props;
    const backdropClassnames =
      "flex justify-center align-center fixed top left bottom right";

    return (
      <SandboxedPortal
        container={this._modalElement}
        enableMouseEvents={enableMouseEvents}
      >
        <TransitionGroup
          appear={enableTransition}
          enter={enableTransition}
          exit={enableTransition}
        >
          {isOpen && (
            <CSSTransition
              key="modal"
              classNames="Modal"
              timeout={{
                appear: 250,
                enter: 250,
                exit: 250,
              }}
            >
              <div
                className={cx(backdropClassName, backdropClassnames)}
                style={style}
              >
                {this._modalComponent()}
              </div>
            </CSSTransition>
          )}
        </TransitionGroup>
      </SandboxedPortal>
    );
  }
}

export class FullPageModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: true,
    };

    this._modalElement = document.createElement("div");
    this._modalElement.className = "ModalContainer";
    document.body.appendChild(this._modalElement);

    // save the scroll position, scroll to the top left, and disable scrolling
    this._scrollX = getScrollX();
    this._scrollY = getScrollY();
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";
  }

  setTopOfModalToBottomOfNav() {
    const nav = document.body.querySelector(".Nav");
    if (nav) {
      this._modalElement.style.top = nav.getBoundingClientRect().bottom + "px";
    }
  }

  componentDidMount() {
    this.setTopOfModalToBottomOfNav();
  }

  componentDidUpdate() {
    if (!this.state.isOpen) {
      document.body.style.overflow = "";
    }
    this.setTopOfModalToBottomOfNav();
  }

  componentWillUnmount() {
    this._modalElement.parentNode.removeChild(this._modalElement);
    document.body.style.overflow = "";
  }

  handleDismissal = () => {
    this.setState({ isOpen: false });

    // wait for animations to complete before unmounting
    setTimeout(() => this.props.onClose && this.props.onClose(), 300);
  };

  render() {
    const open = this.state.isOpen;
    return (
      <Motion
        defaultStyle={{ opacity: 0, top: 20 }}
        style={
          open
            ? { opacity: spring(1), top: spring(0) }
            : { opacity: spring(0), top: spring(20) }
        }
      >
        {motionStyle => (
          <SandboxedPortal container={this._modalElement}>
            <div className="Modal--full">
              {/* Using an OnClickOutsideWrapper is weird since this modal
              occupies the entire screen. We do this to put this modal on top of
              the OnClickOutsideWrapper popover stack.  Otherwise, clicks within
              this modal might be seen as clicks outside another popover. */}
              <MaybeOnClickOutsideWrapper
                noOnClickOutsideWrapper={this.props.noOnClickOutsideWrapper}
                handleDismissal={this.handleDismissal}
              >
                <div
                  className="full-height relative scroll-y"
                  style={motionStyle}
                >
                  {getModalContent({
                    ...this.props,
                    fullPageModal: true,
                    formModal: !!this.props.form,
                    onClose: this.handleDismissal,
                  })}
                </div>
              </MaybeOnClickOutsideWrapper>
            </div>
          </SandboxedPortal>
        )}
      </Motion>
    );
  }
}

// the "routeless" version should only be used for non-inline modals
const RoutelessFullPageModal = routeless(FullPageModal);

const Modal = ({ full = false, ...props }) =>
  full ? (
    props.isOpen ? (
      <RoutelessFullPageModal {...props} />
    ) : null
  ) : (
    <WindowModal {...props} />
  );

Modal.defaultProps = {
  isOpen: true,
};

export default Modal;
