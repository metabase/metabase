/* eslint-disable react/prop-types */
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

/**
 * @deprecated use MLv2
 */
export const Clearable = ({ onClear, children, className }) => (
  <span className={cx(CS.flex, CS.alignCenter, className)}>
    {children}
    {onClear && (
      <a
        className={cx(
          CS.textLight,
          CS.noDecoration,
          CS.pr1,
          CS.flex,
          CS.alignCenter,
        )}
        onClick={onClear}
      >
        <Icon name="close" />
      </a>
    )}
  </span>
);
