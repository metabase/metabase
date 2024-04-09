import PropTypes from "prop-types";

import CS from "metabase/css/core/index.css";

import { BadgeIcon, BadgeText, MaybeLink } from "./Badge.styled";

const iconProp = PropTypes.oneOfType([PropTypes.string, PropTypes.object]);

const propTypes = {
  to: PropTypes.string,
  icon: iconProp,
  inactiveColor: PropTypes.string,
  activeColor: PropTypes.string,
  isSingleLine: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

const DEFAULT_ICON_SIZE = 16;

function getIconProps(iconProp) {
  if (!iconProp) {
    return;
  }
  const props = typeof iconProp === "string" ? { name: iconProp } : iconProp;
  if (!props.size && !props.width && !props.height) {
    props.size = DEFAULT_ICON_SIZE;
  }
  return props;
}

function Badge({
  icon,
  inactiveColor = "text-medium",
  activeColor = "brand",
  isSingleLine,
  children,
  ...props
}) {
  return (
    <MaybeLink
      inactiveColor={inactiveColor}
      activeColor={activeColor}
      isSingleLine={isSingleLine}
      {...props}
    >
      {icon && <BadgeIcon {...getIconProps(icon)} hasMargin={!!children} />}
      {children && (
        <BadgeText className={CS.textWrap} isSingleLine={isSingleLine}>
          {children}
        </BadgeText>
      )}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export { MaybeLink };

export default Badge;
