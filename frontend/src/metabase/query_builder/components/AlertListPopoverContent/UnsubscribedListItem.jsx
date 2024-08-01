import cx from "classnames";
import { jt } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

export const UnsubscribedListItem = () => (
  <li
    className={cx(
      CS.borderBottom,
      CS.flex,
      CS.alignCenter,
      CS.py4,
      CS.textBold,
    )}
  >
    <div
      className={cx(
        CS.circle,
        CS.flex,
        CS.alignCenter,
        CS.justifyCenter,
        CS.p1,
        CS.bgLight,
        CS.ml2,
      )}
    >
      <Icon name="check" className={CS.textSuccess} />
    </div>
    <h3
      className={CS.textDark}
      style={{ marginLeft: 10 }}
    >{jt`Okay, you're unsubscribed`}</h3>
  </li>
);
