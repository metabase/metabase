import React, { Component, ReactNode } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import {
  ActionIcon,
  ActionsWrapper,
  HeaderContainer,
} from "./ModalContent.styled";

export interface ModalContentProps extends CommonModalProps {
  id?: string;
  title: string;
  footer?: ReactNode;
  children: ReactNode;

  className?: string;
}

export interface ModalHeaderAction {
  icon: string;
  onClick: () => void;
}

interface CommonModalProps {
  // takes over the entire screen
  fullPageModal?: boolean;
  // standard modal
  formModal?: boolean;
  centeredTitle?: boolean;

  headerActions?: ModalHeaderAction[];
  onClose?: () => void;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class ModalContent extends Component<ModalContentProps> {
  static propTypes = {
    id: PropTypes.string,
    title: PropTypes.string,
    centeredTitle: PropTypes.bool,
    onClose: PropTypes.func,
    // takes over the entire screen
    fullPageModal: PropTypes.bool,
    // standard modal
    formModal: PropTypes.bool,

    headerActions: PropTypes.arrayOf(
      PropTypes.shape({
        icon: PropTypes.string,
        onClick: PropTypes.func,
      }),
    ),
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
      title,
      centeredTitle,
      footer,
      onClose,
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
          "ModalContent flex-full flex flex-column relative",
          className,
          { "full-height": fullPageModal && !formModal },
          // add bottom padding if this is a standard "form modal" with no footer
          { pb4: formModal && !footer },
        )}
      >
        {title && (
          <ModalHeader
            fullPageModal={fullPageModal}
            centeredTitle={centeredTitle}
            formModal={formModal}
            headerActions={headerActions}
            onClose={onClose}
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

interface ModalHeaderProps extends CommonModalProps {
  children: ReactNode;
}

export const ModalHeader = ({
  children,
  fullPageModal,
  centeredTitle,
  headerActions,
  onClose,
}: ModalHeaderProps) => {
  const hasActions = !!headerActions?.length || !!onClose;
  const actionIconSize = fullPageModal ? 24 : 16;

  return (
    <HeaderContainer>
      <h2
        className={cx("text-bold", {
          "text-centered": fullPageModal || centeredTitle,
        })}
      >
        {children}
      </h2>

      {hasActions && (
        <ActionsWrapper>
          {headerActions?.map(({ icon, onClick }) => (
            <ActionIcon
              key={icon}
              name={icon}
              size={actionIconSize}
              onClick={onClick}
            />
          ))}
          {onClose && (
            <ActionIcon name="close" size={actionIconSize} onClick={onClose} />
          )}
        </ActionsWrapper>
      )}
    </HeaderContainer>
  );
};

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
      px4: formModal,
      "flex flex-full flex-basis-auto": !formModal,
    })}
  >
    <div
      className="flex-full ml-auto mr-auto flex flex-column"
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
      "ModalFooter flex flex-no-shrink px4",
      fullPageModal ? "py4" : "py3",
    )}
  >
    <div
      className="ml-auto flex align-center"
      style={{ maxWidth: formModal && fullPageModal ? FORM_WIDTH : undefined }}
    >
      {Array.isArray(children)
        ? children.map((child, index) => (
            <span key={index} className="ml2">
              {child}
            </span>
          ))
        : children}
    </div>
  </div>
);
