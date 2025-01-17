import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

// TODO: use for notifications create / edit notifications
export const AlertToastContent = () => (
  <div className={cx(CS.flex, CS.alignCenter, CS.textBold)}>
    <Icon
      name="alert_confirm"
      size="19"
      className={cx(CS.mr2, CS.textSuccess)}
    />
    {t`Your alert is all set up.`}
  </div>
);
