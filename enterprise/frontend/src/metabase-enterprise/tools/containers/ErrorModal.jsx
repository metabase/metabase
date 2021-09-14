import React, { useState } from "react";

import { t } from "ttag";

import Modal from "metabase/components/Modal";

export default class ErrorModal extends React.Component {
  render() {
    const {
      onClose,
      onSaved,
    } = this.props;

    return (
      <Modal onClose={onClose}>
      <div>blah blah blah maybe this one will work lol</div>
      </Modal>
    );
  g
}
