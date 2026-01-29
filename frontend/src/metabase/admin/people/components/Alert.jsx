/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { Button, Modal, Title } from "metabase/ui";

const Alert = ({ message, onClose }) => (
  <Modal
    size="md"
    opened={!!message}
    withCloseButton={false}
    padding="0"
    data-testid="alert-modal"
  >
    <div className={cx(CS.flex, CS.flexColumn, CS.layoutCentered, CS.p4)}>
      <Title order={3} className={cx(CS.mb2, CS.textWrap)}>
        {message}
      </Title>
      <Button
        className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
        variant="primary"
        onClick={onClose}
      >{t`Ok`}</Button>
    </div>
  </Modal>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Alert;
