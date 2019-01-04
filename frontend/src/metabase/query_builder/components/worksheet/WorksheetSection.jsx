import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

const SHOW_ICON = false;
const SHOW_NAME = false;
const SHOW_CLEAR = false;

const WorksheetSection = ({
  icon,
  name,
  color,
  header,
  style,
  className,
  children,
  onClear,
  footerButtons,
}) => (
  <div
    style={style}
    className={cx(className, "wrapper border-row-divider py4 relative")}
  >
    {((SHOW_ICON && icon) || (SHOW_NAME && name) || header) && (
      <div className={cx("flex align-center", { mb2: !!children })}>
        {SHOW_ICON &&
          icon && <Icon name={icon} style={{ color }} className="mr1" />}
        {SHOW_NAME &&
          name && (
            <span className="h3" style={{ color }}>
              {name}
            </span>
          )}
        {header}
        {SHOW_CLEAR &&
          onClear && (
            <Icon
              name="close"
              onClick={onClear}
              size={12}
              className="cursor-pointer circular text-white flex-align-right"
              style={{ backgroundColor: color, padding: 3 }}
            />
          )}
      </div>
    )}
    {children}
    {footerButtons &&
      footerButtons.length > 0 && (
        <div
          className="absolute bottom left right flex layout-centered z1"
          // FIXME: don't hardcode -20px
          style={{ bottom: -20 }}
        >
          {footerButtons}
        </div>
      )}
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
