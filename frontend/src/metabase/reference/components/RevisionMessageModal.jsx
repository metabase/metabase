/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, Component } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

import S from "./RevisionMessageModal.module.css";

export default class RevisionMessageModal extends Component {
  static propTypes = {
    action: PropTypes.func.isRequired,
    field: PropTypes.object.isRequired,
    submitting: PropTypes.bool,
    children: PropTypes.any,
  };

  constructor(props) {
    super(props);

    this.modal = createRef();
  }

  render() {
    const { action, children, field, submitting } = this.props;

    const onClose = () => {
      this.modal.current.close();
    };

    const onAction = () => {
      onClose();
      action();
    };

    return (
      <ModalWithTrigger ref={this.modal} triggerElement={children}>
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
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
              onClick={onAction}
              disabled={submitting || field.error}
            >{t`Save changes`}</button>
            <button
              type="button"
              className={cx(ButtonsS.Button, CS.ml1)}
              onClick={onClose}
            >{t`Cancel`}</button>
          </div>
        </ModalContent>
      </ModalWithTrigger>
    );
  }
}
