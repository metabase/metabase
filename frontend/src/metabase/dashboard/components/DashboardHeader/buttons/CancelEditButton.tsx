import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";

export const CancelEditButton = () => {
  const { setEditingDashboard } = useDashboardContext();

  return (
    <Button
      key="cancel"
      className={cx(ButtonsS.Button, ButtonsS.ButtonSmall, CS.mr1)}
      onClick={() => setEditingDashboard(null)}
    >
      {t`Cancel`}
    </Button>
  );
};
