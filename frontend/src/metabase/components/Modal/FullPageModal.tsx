import cx from "classnames";
import { Component } from "react";

import { MaybeOnClickOutsideWrapper } from "metabase/components/Modal/MaybeOnClickOutsideWrapper";
import type { BaseModalProps } from "metabase/components/Modal/utils";
import { getModalContent } from "metabase/components/Modal/utils";
import SandboxedPortal from "metabase/components/SandboxedPortal";
import ModalS from "metabase/css/components/modal.module.css";
import CS from "metabase/css/core/index.css";
import { getScrollX, getScrollY } from "metabase/lib/dom";
import { Transition } from "metabase/ui";

export type FullPageModalProps = BaseModalProps & {
  isOpen: boolean;
  onClose?: () => void;
  fullPageModal?: boolean;
};

type FullPageModalState = {
  isOpen: boolean;
};

const slideIn = {
  in: { opacity: 1, top: 0 },
  out: { opacity: 0, top: 20 },
  common: { transformOrigin: "top" },
  transitionProperty: "top, opacity",
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
      isOpen: false,
    };

    this._modalElement = document.createElement("div");
    this._modalElement.className = ModalS.ModalContainer;
    document.body.appendChild(this._modalElement);

    // save the scroll position, scroll to the top left, and disable scrolling
    this._scrollX = getScrollX();
    this._scrollY = getScrollY();
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";
  }

  setTopOfModalToBottomOfNav() {
    const nav = document.body.querySelector("[data-element-id='navbar-root']");

    if (nav) {
      this._modalElement.style.top = nav.getBoundingClientRect().bottom + "px";
    }
  }

  componentDidMount() {
    this.setTopOfModalToBottomOfNav();
    this.setState({
      isOpen: true,
    });
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
      <Transition mounted={open} transition={slideIn} duration={300}>
        {styles => (
          <SandboxedPortal container={this._modalElement}>
            <div className={ModalS.ModalFull}>
              {/* Using an OnClickOutsideWrapper is weird since this modal
              occupies the entire screen. We do this to put this modal on top of
              the OnClickOutsideWrapper popover stack.  Otherwise, clicks within
              this modal might be seen as clicks outside another popover. */}
              <MaybeOnClickOutsideWrapper
                handleDismissal={this.handleDismissal}
                closeOnClickOutside={this.props.closeOnClickOutside}
              >
                <div
                  className={cx(CS.fullHeight, CS.relative, CS.scrollY)}
                  style={styles}
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
      </Transition>
    );
  }
}
