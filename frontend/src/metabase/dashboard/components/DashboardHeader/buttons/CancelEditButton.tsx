import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

export const CancelEditButton = (props: { onClick: () => void }) => (
  <Button
    key="cancel"
    className={cx(ButtonsS.Button, ButtonsS.ButtonSmall, CS.mr1)}
    onClick={props.onClick}
  >
    {t`Cancel`}
  </Button>
);
