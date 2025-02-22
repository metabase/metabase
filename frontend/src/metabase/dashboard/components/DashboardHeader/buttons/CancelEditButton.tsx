import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useRegisterActions } from "kbar";

export const CancelEditButton = (props: { onClick: () => void }) => {
  useRegisterActions([
    {
      id: "cancel-edit",
      name: "Cancel Edit Dashboard",
      shortcut: ["Escape"],
      perform: props.onClick,
    },
  ]);

  return (
    <Button
      key="cancel"
      className={cx(ButtonsS.Button, ButtonsS.ButtonSmall, CS.mr1)}
      onClick={props.onClick}
    >
      {t`Cancel`}
    </Button>
  );
};
