import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import Icon from "metabase/components/Icon";

export default class ModalContent extends Component {
  static propTypes = {
    id: PropTypes.string,
    title: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    // takes over the entire screen
    fullPageModal: PropTypes.bool,
    // standard modal
    formModal: PropTypes.bool,
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
      footer,
      onClose,
      children,
      className,
      fullPageModal,
      formModal,
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
        {onClose && (
          <Icon
            className="text-light text-medium-hover cursor-pointer absolute z2 m2 p2 top right"
            name="close"
            size={fullPageModal ? 24 : 16}
            onClick={onClose}
          />
        )}
        {title && (
          <ModalHeader fullPageModal={fullPageModal} formModal={formModal}>
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

export const ModalHeader = ({ children, fullPageModal, formModal }) => (
  <div className={cx("ModalHeader flex-no-shrink px4 py4 full")}>
    <h2
      className={cx(
        "text-bold",
        { "text-centered": fullPageModal },
        { mr4: !fullPageModal },
      )}
    >
      {children}
    </h2>
  </div>
);

export const ModalBody = ({ children, fullPageModal, formModal }) => (
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

export const ModalFooter = ({ children, fullPageModal, formModal }) => (
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
