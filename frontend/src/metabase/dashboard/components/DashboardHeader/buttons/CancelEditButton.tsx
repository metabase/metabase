import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDashboardContext } from "metabase/dashboard/context";

export const CancelEditButton = (props: { onClick?: () => void }) => {

  const { fetchDashboard, cancelEditingDashboard, dashboard, parameterQueryParams } = useDashboardContext()

  const onClickCancel = props.onClick ?? (() => {
    if (dashboard) {
      fetchDashboard({
        dashId: dashboard.id,
        queryParams: parameterQueryParams ?? {},
        options: { preserveParameters: true },
      })
      cancelEditingDashboard();
    }
  })

  useRegisterShortcut([
    {
      id: "dashboard-cancel-edit",
      perform: onClickCancel
    },
  ]);

  return (
    <Button
      key="cancel"
      className={cx(ButtonsS.Button, ButtonsS.ButtonSmall, CS.mr1)}
      onClick={onClickCancel}
    >
      {t`Cancel`}
    </Button>
  );
};
