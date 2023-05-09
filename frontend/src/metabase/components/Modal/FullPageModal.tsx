import React, { Component } from "react";
import { Motion, spring } from "react-motion";
import { getScrollX, getScrollY } from "metabase/lib/dom";
import SandboxedPortal from "metabase/components/SandboxedPortal";
import {
  BaseModalProps,
  getModalContent,
} from "metabase/components/Modal/common";
import { MaybeOnClickOutsideWrapper } from "metabase/components/Modal/MaybeOnClickOutsideWrapper";

export type FullPageModalProps = BaseModalProps & {
  isOpen: boolean;
  onClose: () => void;
  fullPageModal?: boolean;
};

type FullPageModalState = {
  isOpen: boolean;
};

export class FullPageModal extends Component<
  FullPageModalProps,
  FullPageModalState
> {
  _modalElement: HTMLDivElement;
  _scrollX: number;
  _scrollY: number;

  constructor(props: FullPageModalProps) {
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
    if (this._modalElement.parentNode) {
      this._modalElement.parentNode.removeChild(this._modalElement);
    }
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
                handleDismissal={this.handleDismissal}
                noOnClickOutsideWrapper={this.props.noOnClickOutsideWrapper}
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
