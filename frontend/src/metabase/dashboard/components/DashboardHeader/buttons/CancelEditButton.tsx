import cx from "classnames";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";

export const CancelEditButton = (props: { onClick: () => void }) => {
  useRegisterShortcut([
    {
      id: "dashboard-cancel-edit",
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
