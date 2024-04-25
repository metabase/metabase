import cx from "classnames";
import PropTypes from "prop-types";
import type { ReactNode } from "react";
import { Component } from "react";

import CS from "metabase/css/core/index.css";

import { ModalHeader } from "./ModalHeader";
import type { CommonModalProps } from "./types";

export interface ModalContentProps extends CommonModalProps {
  "data-testid"?: string;
  id?: string;
  title: string;
  footer?: ReactNode;
  children: ReactNode;

  className?: string;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class ModalContent extends Component<ModalContentProps> {
  static propTypes = {
    "data-testid": PropTypes.string,
    id: PropTypes.string,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    centeredTitle: PropTypes.bool,
    onClose: PropTypes.func,
    onBack: PropTypes.func,
    // takes over the entire screen
    fullPageModal: PropTypes.bool,
    // standard modal
    formModal: PropTypes.bool,

    headerActions: PropTypes.any,
  };

  static defaultProps = {
    formModal: true,
  };

  static childContextTypes = {
    isModal: PropTypes.bool,
  };

  getChildContext() {
    return { isModal: true };
  }

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
          <ModalFooter fullPageModal={fullPageModal} formModal={formModal}>
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
      className={cx(CS.flexFull, CS.mlAuto, CS.mrAuto, CS.flex, CS.flexColumn)}
      style={{ maxWidth: formModal && fullPageModal ? FORM_WIDTH : undefined }}
    >
      {children}
    </div>
  </div>
);

interface ModalFooterProps extends CommonModalProps {
  children: ReactNode;
}

export const ModalFooter = ({
  children,
  fullPageModal,
  formModal,
}: ModalFooterProps) => (
  <div
    className={cx(
      "ModalFooter",
      CS.flex,
      CS.flexNoShrink,
      CS.px4,
      fullPageModal ? CS.py4 : CS.py3,
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
