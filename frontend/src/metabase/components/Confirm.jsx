/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "./ConfirmContent";

export default class Confirm extends Component {
  static propTypes = {
    action: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    children: PropTypes.any,
    content: PropTypes.any,
    triggerClasses: PropTypes.string,
  };

  render() {
    const { action, children, title, content, triggerClasses } = this.props;
    return (
      <ModalWithTrigger
        ref="modal"
        triggerElement={children}
        triggerClasses={triggerClasses}
      >
        <ConfirmContent
          title={title}
          content={content}
          onClose={() => {
            this.refs.modal.close();
          }}
          onAction={action}
        />
      </ModalWithTrigger>
    );
  }
}
