/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ConfirmContent from "./ConfirmContent";

export default class Confirm extends Component {
  constructor(props) {
    super(props);

    this.modal = React.createRef();
  }

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
        ref={this.modal}
        triggerElement={children}
        triggerClasses={triggerClasses}
      >
        <ConfirmContent
          title={title}
          content={content}
          onClose={() => {
            this.modal.current.close();
          }}
          onAction={action}
        />
      </ModalWithTrigger>
    );
  }
}
