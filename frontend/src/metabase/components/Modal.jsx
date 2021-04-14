/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { getScrollX, getScrollY } from "metabase/lib/dom";

import { CSSTransitionGroup } from "react-transition-group";
import { Motion, spring } from "react-motion";

import SandboxedPortal from "metabase/components/SandboxedPortal";
import OnClickOutsideWrapper from "./OnClickOutsideWrapper";
import ModalContent from "./ModalContent";

import _ from "underscore";

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
  };

  static defaultProps = {
    className: "Modal",
    backdropClassName: "Modal-backdrop",
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
      ...["small", "medium", "wide", "tall"]
        .filter(type => this.props[type])
        .map(type => `Modal--${type}`),
    );
    return (
      <OnClickOutsideWrapper handleDismissal={this.handleDismissal}>
        <div className={cx(className, "relative bg-white rounded")}>
          {getModalContent({
            ...this.props,
            fullPageModal: false,
            // if there is a form then its a form modal, or if there's a form
            // modal prop use that
            formModal: !!this.props.form || this.props.formModal,
          })}
        </div>
      </OnClickOutsideWrapper>
    );
  }

  render() {
    const { backdropClassName, isOpen, style } = this.props;
    const backdropClassnames =
      "flex justify-center align-center fixed top left bottom right";

    return (
      <SandboxedPortal container={this._modalElement}>
        <CSSTransitionGroup
          transitionName="Modal"
          transitionAppear={true}
          transitionAppearTimeout={250}
          transitionEnterTimeout={250}
          transitionLeaveTimeout={250}
        >
          {isOpen && (
            <div
              key="modal"
              className={cx(backdropClassName, backdropClassnames)}
              style={style}
            >
              {this._modalComponent()}
            </div>
          )}
        </CSSTransitionGroup>
      </SandboxedPortal>
    );
  }
}

import routeless from "metabase/hoc/Routeless";

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
              <OnClickOutsideWrapper handleDismissal={this.handleDismissal}>
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
              </OnClickOutsideWrapper>
            </div>
          </SandboxedPortal>
        )}
      </Motion>
    );
  }
}

// the "routeless" version should only be used for non-inline modals
const RoutelessFullPageModal = routeless(FullPageModal);

const Modal = ({ full, ...props }) =>
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
