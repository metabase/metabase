import cx from "classnames";
// import { useRegisterActions } from "kbar";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const CancelEditButton = (props: { onClick: () => void }) => {
  useRegisterShortcut([
    {
      id: "cancel-edit",
      name: "Cancel Edit Dashboard",
      shortcut: ["c"],
      shortcutGroup: "edit-dashboard",
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
