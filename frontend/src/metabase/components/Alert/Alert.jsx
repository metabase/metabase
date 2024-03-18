/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ButtonsS from "metabase/css/components/buttons.module.css";

const Alert = ({ message, onClose }) => (
  <Modal small isOpen={!!message}>
    <div className="flex flex-column layout-centered p4">
      <h3 className="mb4">{message}</h3>
      <button
        className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
        onClick={onClose}
      >{t`Ok`}</button>
    </div>
  </Modal>
);

export default Alert;
