import cx from "classnames";
import type { CSSProperties } from "react";
import { Component } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";

import { MaybeOnClickOutsideWrapper } from "metabase/components/Modal/MaybeOnClickOutsideWrapper";
import type {
  ModalSize,
  BaseModalProps,
} from "metabase/components/Modal/utils";
import { getModalContent, modalSizes } from "metabase/components/Modal/utils";
import SandboxedPortal from "metabase/components/SandboxedPortal";
import ModalS from "metabase/css/components/modal.module.css";
import CS from "metabase/css/core/index.css";
import { FocusTrap } from "metabase/ui";

export type WindowModalProps = BaseModalProps & {
  isOpen?: boolean;
  onClose?: () => void;
  fullPageModal?: boolean;
  formModal?: boolean;
  style?: CSSProperties;
  "data-testid"?: string;
  zIndex?: number;
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
        .map(type => MODAL_CLASSES[type]),
    );
    return (
      <MaybeOnClickOutsideWrapper
        backdropElement={this._modalElement}
        handleDismissal={this.handleDismissal}
        closeOnClickOutside={this.props.closeOnClickOutside}
      >
        <FocusTrap active={this.props.trapFocus}>
          <div
            className={cx(className, CS.relative, CS.bgWhite, CS.rounded)}
            role="dialog"
            data-testid="modal"
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
      enableMouseEvents,
      isOpen,
      style,
      enableTransition,
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

    return (
      <SandboxedPortal
        container={this._modalElement}
        enableMouseEvents={enableMouseEvents}
        // disable keydown to allow FocusTrap to work
        unsandboxedEvents={["onKeyDown"]}
      >
        <TransitionGroup
          appear={enableTransition}
          enter={enableTransition}
          exit={enableTransition}
        >
          {isOpen && (
            <CSSTransition
              key="modal"
              classNames={{
                appear: ModalS.ModalAppear,
                appearActive: ModalS.ModalAppearActive,
                enter: ModalS.ModalEnter,
                enterActive: ModalS.ModalEnterActive,
                exit: ModalS.ModalExit,
                exitActive: ModalS.ModalExitActive,
              }}
              timeout={{
                appear: 250,
                enter: 250,
                exit: 250,
              }}
            >
              <div
                className={cx(ModalS.ModalBackdrop, backdropClassnames)}
                style={style}
                data-testid={dataTestId}
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
