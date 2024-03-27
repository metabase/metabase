import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

const FieldSeparator = () => {
  return (
    <Icon name="chevronright" size={12} className={cx(CS.mx2, CS.textMedium)} />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldSeparator;
