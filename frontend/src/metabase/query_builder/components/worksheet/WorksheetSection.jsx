import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

const WorksheetSection = ({
  icon,
  name,
  color,
  header,
  style,
  className,
  children,
}) => (
  <div
    style={style}
    className={cx(className, "wrapper border-row-divider py4")}
  >
    {(icon || name || header) && (
      <div className={cx("flex align-center", { mb2: !!children })}>
        {icon && <Icon name={icon} style={{ color }} className="mr1" />}
        {name && (
          <span className="h3" style={{ color }}>
            {name}
          </span>
        )}
        {header}
      </div>
    )}
    {children}
  </div>
);

export const WorksheetSectionSubHeading = ({ children }) => (
  <div className="text-uppercase text-small mb1">{children}</div>
);

export const WorksheetSectionButton = ({
  name,
  icon,
  color,
  className,
  showTitle = true,
  style = {},
  ...props
}) => (
  <RoundButtonWithIcon
    icon={icon}
    className={cx(className, "bordered bg-white text-bold")}
    style={{ color, ...style }}
    {...props}
  >
    {showTitle ? name : null}
  </RoundButtonWithIcon>
);

export default WorksheetSection;
