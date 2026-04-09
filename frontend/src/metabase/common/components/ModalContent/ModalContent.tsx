import cx from "classnames";
import type { ReactNode } from "react";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import ZIndex from "metabase/css/core/z-index.module.css";

import { ModalHeader } from "./ModalHeader";
import type { CommonModalProps } from "./types";

export interface ModalContentProps extends CommonModalProps {
  "data-testid"?: string;
  id?: string;
  title?: string | ReactNode;
  footer?: ReactNode;
  withFooterTopBorder?: boolean;
  children: ReactNode;

  className?: string;
}

export class ModalContent extends Component<ModalContentProps> {
  static defaultProps = {
    formModal: true,
  };

  render() {
    const {
      "data-testid": dataTestId,
      title,
      centeredTitle,
      footer,
      onClose,
      onBack,
      children,
      className,
      fullPageModal,
      formModal,
      headerActions,
      withFooterTopBorder,
    } = this.props;

    return (
      <div
        id={this.props.id}
        className={cx(
          "ModalContent",
          CS.flexFull,
          CS.flex,
          CS.flexColumn,
          CS.relative,
          className,
          { [CS.fullHeight]: fullPageModal && !formModal },
          // add bottom padding if this is a standard "form modal" with no footer
          { [CS.pb4]: formModal && !footer },
          ZIndex.Overlay,
        )}
        data-testid={dataTestId}
      >
        {title && (
          <ModalHeader
            fullPageModal={fullPageModal}
            centeredTitle={centeredTitle}
            formModal={formModal}
            headerActions={headerActions}
            onClose={onClose}
            onBack={onBack}
          >
            {title}
          </ModalHeader>
        )}
        <ModalBody fullPageModal={fullPageModal} formModal={formModal}>
          {children}
        </ModalBody>
        {footer && (
          <ModalFooter
            fullPageModal={fullPageModal}
            formModal={formModal}
            withTopBorder={withFooterTopBorder}
          >
            {footer}
          </ModalFooter>
        )}
      </div>
    );
  }
}

const FORM_WIDTH = 500 + 32 * 2; // includes padding

interface ModalBodyProps extends CommonModalProps {
  children: ReactNode;
}

export const ModalBody = ({
  children,
  fullPageModal,
  formModal,
}: ModalBodyProps) => (
  <div
    className={cx("ModalBody", {
      [CS.px4]: formModal,
      [cx(CS.flex, CS.flexFull, CS.flexBasisAuto)]: !formModal,
    })}
  >
    <div
      className={cx(
        CS.flexFull,
        CS.mlAuto,
        CS.mrAuto,
        CS.flex,
        CS.flexColumn,
        ZIndex.Overlay,
      )}
      style={{ maxWidth: formModal && fullPageModal ? FORM_WIDTH : undefined }}
    >
      {children}
    </div>
  </div>
);

interface ModalFooterProps extends CommonModalProps {
  withTopBorder?: boolean;
  children: ReactNode;
}

export const ModalFooter = ({
  children,
  fullPageModal,
  formModal,
  withTopBorder,
}: ModalFooterProps) => (
  <div
    className={cx(
      "ModalFooter",
      CS.flex,
      CS.flexNoShrink,
      CS.px4,
      fullPageModal ? CS.py4 : CS.py3,
      withTopBorder && CS.borderTop,
      withTopBorder && CS.mt4,
    )}
  >
    <div
      className={cx(CS.mlAuto, CS.flex, CS.alignCenter)}
      style={{ maxWidth: formModal && fullPageModal ? FORM_WIDTH : undefined }}
    >
      {Array.isArray(children)
        ? children.map((child, index) => (
            <span key={index} className={CS.ml2}>
              {child}
            </span>
          ))
        : children}
    </div>
  </div>
);
