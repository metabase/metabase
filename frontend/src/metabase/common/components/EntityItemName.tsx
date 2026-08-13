import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Ellipsified } from "metabase/ui";

export function EntityItemName({
  name,
  variant,
  ...props
}: {
  name: string;
  variant?: string;
} & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cx(CS.overflowHidden, {
        [CS.textList]: variant === "list",
      })}
      {...props}
    >
      <Ellipsified>{name}</Ellipsified>
    </h3>
  );
}
