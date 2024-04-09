/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

const Alert = ({ message, onClose }) => (
  <Modal small isOpen={!!message}>
    <div className={cx(CS.flex, CS.flexColumn, CS.layoutCentered, CS.p4)}>
      <h3 className={CS.mb4}>{message}</h3>
      <button
        className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
        onClick={onClose}
      >{t`Ok`}</button>
    </div>
  </Modal>
);

export default Alert;
