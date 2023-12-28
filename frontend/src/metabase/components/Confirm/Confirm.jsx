/* eslint "react/prop-types": "warn" */
import { createRef, Component } from "react";
import PropTypes from "prop-types";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "metabase/components/ConfirmContent";

export default class Confirm extends Component {
  constructor(props) {
    super(props);

    this.modal = createRef();
  }

  static propTypes = {
    action: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    message: PropTypes.string,
    confirmButtonText: PropTypes.string,
    cancelButtonText: PropTypes.string,
    children: PropTypes.any,
    content: PropTypes.any,
    triggerClasses: PropTypes.string,
  };

  render() {
    const {
      action,
      children,
      title,
      content,
      message,
      confirmButtonText,
      cancelButtonText,
      triggerClasses,
    } = this.props;
    return (
      <ModalWithTrigger
        ref={this.modal}
        triggerElement={children}
        triggerClasses={triggerClasses}
      >
        <ConfirmContent
          title={title}
          content={content}
          message={message}
          confirmButtonText={confirmButtonText}
          cancelButtonText={cancelButtonText}
          onClose={() => {
            this.modal.current.close();
          }}
          onAction={action}
        />
      </ModalWithTrigger>
    );
  }
}
