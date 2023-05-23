import React, { Component, CSSProperties } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import cx from "classnames";
import {
  getModalContent,
  ModalSize,
  modalSizes,
  BaseModalProps,
} from "metabase/components/Modal/utils";

import SandboxedPortal from "metabase/components/SandboxedPortal";
import { MaybeOnClickOutsideWrapper } from "metabase/components/Modal/MaybeOnClickOutsideWrapper";

export type WindowModalProps = BaseModalProps & {
  isOpen?: boolean;
  onClose?: () => void;
  fullPageModal?: boolean;
  formModal?: boolean;
  style?: CSSProperties;
} & {
  [size in ModalSize]?: boolean;
};

export class WindowModal extends Component<WindowModalProps> {
  _modalElement: HTMLDivElement;

  static defaultProps = {
    className: "Modal",
    backdropClassName: "Modal-backdrop",
    enableTransition: true,
  };

  constructor(props: WindowModalProps) {
    super(props);

    this._modalElement = document.createElement("div");
    this._modalElement.className = "ModalContainer";
    document.body.appendChild(this._modalElement);
  }

  componentWillUnmount() {
    if (this._modalElement.parentNode) {
      this._modalElement.parentNode.removeChild(this._modalElement);
    }
  }

  handleDismissal = () => {
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  _modalComponent() {
    const className = cx(
      this.props.className,
      ...modalSizes
        .filter(type => this.props[type])
        .map(type => `Modal--${type}`),
    );
    return (
      <MaybeOnClickOutsideWrapper
        backdropElement={this._modalElement}
        handleDismissal={this.handleDismissal}
        noOnClickOutsideWrapper={this.props.noOnClickOutsideWrapper}
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
