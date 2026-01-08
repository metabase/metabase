import cx from "classnames";
import type { CSSProperties } from "react";
import { Component } from "react";

import { MaybeOnClickOutsideWrapper } from "metabase/common/components/Modal/MaybeOnClickOutsideWrapper";
import type {
  BaseModalProps,
  ModalSize,
} from "metabase/common/components/Modal/utils";
import {
  getModalContent,
  modalSizes,
} from "metabase/common/components/Modal/utils";
import SandboxedPortal from "metabase/common/components/SandboxedPortal";
import ModalS from "metabase/css/components/modal.module.css";
import CS from "metabase/css/core/index.css";
import { getPortalRootElement } from "metabase/css/core/overlays/utils";
import ZIndex from "metabase/css/core/z-index.module.css";
import { FocusTrap } from "metabase/ui";

export type WindowModalProps = BaseModalProps & {
  isOpen?: boolean;
  onClose?: () => void;
  fullPageModal?: boolean;
  formModal?: boolean;
  style?: CSSProperties;
  "data-testid"?: string;
  "aria-labelledby"?: string;
  zIndex?: number;
  disableEventSandbox?: boolean;
  trapFocus?: boolean;
} & {
  [size in ModalSize]?: boolean;
};

const MODAL_CLASSES = {
  small: ModalS.ModalSmall,
  medium: ModalS.ModalMedium,
  wide: ModalS.ModalWide,
  tall: ModalS.ModalTall,
  fit: ModalS.ModalFit,
} as const;

export class WindowModal extends Component<WindowModalProps> {
  _modalElement: HTMLDivElement;
  _transitionState: "entering" | "entered" | "exiting" | "exited" = "exited";

  static defaultProps = {
    className: ModalS.Modal,
    enableTransition: true,
    trapFocus: true,
  };

  constructor(props: WindowModalProps) {
    super(props);

    this._modalElement = document.createElement("div");
    this._modalElement.className = ModalS.ModalContainer;

    if (props.zIndex != null) {
      this._modalElement.style.zIndex = String(props.zIndex);
    }

    if (props.isOpen) {
      getPortalRootElement().appendChild(this._modalElement);
      this._transitionState = "entering";
    }
  }

  componentDidUpdate(prevProps: WindowModalProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      getPortalRootElement().appendChild(this._modalElement);
      this._transitionState = "entering";
      this.forceUpdate(); // Force re-render with entering state
      // Trigger transition to entered after a frame
      if (this.props.enableTransition) {
        requestAnimationFrame(() => {
          this._transitionState = "entered";
          this.forceUpdate();
        });
      } else {
        this._transitionState = "entered";
      }
    } else if (prevProps.isOpen && !this.props.isOpen) {
      this._transitionState = "exiting";
      this.forceUpdate(); // Force re-render with exiting state
      if (this.props.enableTransition) {
        // Wait for exit animation before updating state
        setTimeout(() => {
          this._transitionState = "exited";
          this.forceUpdate();
        }, 250);
      } else {
        this._transitionState = "exited";
      }
    }
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
        .filter((type) => this.props[type])
        .map((type) => MODAL_CLASSES[type]),
    );
    return (
      <MaybeOnClickOutsideWrapper
        backdropElement={this._modalElement}
        handleDismissal={this.handleDismissal}
        closeOnClickOutside={this.props.closeOnClickOutside}
      >
        <FocusTrap active={this.props.trapFocus}>
          <div
            className={cx(
              className,
              CS.relative,
              CS.bgWhite,
              CS.rounded,
              CS.textDark,
              ZIndex.Overlay,
            )}
            role="dialog"
            data-testid="modal"
            aria-labelledby={this.props["aria-labelledby"]}
          >
            {getModalContent({
              ...this.props,
              fullPageModal: false,
              // if there is a form then its a form modal, or if there's a form
              // modal prop use that
              formModal: !!this.props.form || this.props.formModal,
            })}
          </div>
        </FocusTrap>
      </MaybeOnClickOutsideWrapper>
    );
  }

  render() {
    const {
      disableEventSandbox,
      enableMouseEvents,
      isOpen,
      style,
      "data-testid": dataTestId,
    } = this.props;
    const backdropClassnames = cx(
      CS.flex,
      CS.justifyCenter,
      CS.alignCenter,
      CS.fixed,
      CS.top,
      CS.left,
      CS.bottom,
      CS.right,
    );

    const shouldRender = isOpen || this._transitionState === "exiting";

    return (
      <SandboxedPortal
        container={this._modalElement}
        disabled={disableEventSandbox}
        enableMouseEvents={enableMouseEvents}
        // disable keydown to allow FocusTrap to work
        unsandboxedEvents={["onKeyDown"]}
      >
        {shouldRender && (
          <div
            className={cx(
              ModalS.ModalBackdrop,
              backdropClassnames,
              ZIndex.Overlay,
              {
                [ModalS.ModalAppear]: this._transitionState === "entering",
                [ModalS.ModalAppearActive]: this._transitionState === "entered",
                [ModalS.ModalEnter]: this._transitionState === "entering",
                [ModalS.ModalEnterActive]: this._transitionState === "entered",
                [ModalS.ModalExit]: this._transitionState === "exiting",
                [ModalS.ModalExitActive]: this._transitionState === "exiting",
              },
            )}
            style={style}
            data-testid={dataTestId}
          >
            {this._modalComponent()}
          </div>
        )}
      </SandboxedPortal>
    );
  }
}
