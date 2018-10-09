/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import S from "./RevisionMessageModal.css";

export default class RevisionMessageModal extends Component {
  static propTypes = {
    action: PropTypes.func.isRequired,
    field: PropTypes.object.isRequired,
    submitting: PropTypes.bool,
    children: PropTypes.any,
  };

  render() {
    const { action, children, field, submitting } = this.props;

    const onClose = () => {
      this.refs.modal.close();
    };

    const onAction = () => {
      onClose();
      action();
    };

    return (
      <ModalWithTrigger ref="modal" triggerElement={children}>
        <ModalContent title={t`Reason for changes`} onClose={onClose}>
          <div className={S.modalBody}>
            <textarea
              className={S.modalTextArea}
              placeholder={t`Leave a note to explain what changes you made and why they were required`}
              {...field}
            />
          </div>

          <div className="Form-actions">
            <button
              type="button"
              className="Button Button--primary"
              onClick={onAction}
              disabled={submitting || field.error}
            >{t`Save changes`}</button>
            <button
              type="button"
              className="Button ml1"
              onClick={onClose}
            >{t`Cancel`}</button>
          </div>
        </ModalContent>
      </ModalWithTrigger>
    );
  }
}
