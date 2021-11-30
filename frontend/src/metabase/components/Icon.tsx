import PropTypes from "prop-types";
import React, { Component, forwardRef } from "react";
import styled from "styled-components";
import { color, space, hover } from "styled-system";
import cx from "classnames";

import { color as c } from "metabase/lib/colors";
import { loadIcon } from "metabase/icon_paths";
import { stripLayoutProps } from "metabase/lib/utils";
import Tooltip from "metabase/components/Tooltip";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

const MISSING_ICON_NAME = "unknown";

type IconWrapperProps = {
  open: boolean;
  hover: React.CSSProperties;
};

export const IconWrapper = styled.div<IconWrapperProps>`
  ${space};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 99px;
  cursor: pointer;
  color: ${props => (props.open ? c("brand") : "inherit")};
  // special cases for certain icons
  // Icon-share has a taller viewbox than most so to optically center
  // the icon we need to translate it upwards
  "> .icon.icon-share": {
    transform: translateY(-2px);
  }
  ${hover};
  transition: all 300ms ease-in-out;
`;

IconWrapper.defaultProps = {
  hover: {
    backgroundColor: c("bg-medium"),
    color: c("brand"),
  },
};

const stringOrNumberPropType = PropTypes.oneOfType([
  PropTypes.number,
  PropTypes.string,
]);

export const iconPropTypes = {
  name: PropTypes.string.isRequired,
  size: stringOrNumberPropType,
  width: stringOrNumberPropType,
  height: stringOrNumberPropType,
  scale: stringOrNumberPropType,
  tooltip: PropTypes.string,
  className: PropTypes.string,
};

type IconProps = PropTypes.InferProps<typeof iconPropTypes> & {
  innerRef?: () => void;
};

class BaseIcon extends Component<IconProps> {
  static propTypes = iconPropTypes;

  render() {
    const { name, className, innerRef, ...rest } = this.props;

    const icon = loadIcon(name) || loadIcon(MISSING_ICON_NAME);
    if (!icon) {
      console.warn(`Icon "${name}" does not exist.`);
      return <span ref={innerRef} />;
    }

    const props = {
      ...icon.attrs,
      ...stripLayoutProps(rest),
      className: cx(icon.attrs.className, className),
    };

    for (const prop of ["width", "height", "size", "scale"]) {
      if (typeof props[prop] === "string") {
        props[prop] = parseInt(props[prop], 10);
      }
    }
    if (props.size != null) {
      props.width = props.size;
      props.height = props.size;
    }
    if (props.scale != null && props.width != null && props.height != null) {
      props.width *= props.scale;
      props.height *= props.scale;
    }
    delete props.size, props.scale;

    if (icon.img) {
      // avoid passing `role="img"` to an actual image file
      const { _role, ...rest } = props;
      return (
        <img
          ref={innerRef}
          src={icon.img}
          srcSet={`
          ${icon.img}    1x,
          ${icon.img_2x} 2x
        `}
          {...rest}
        />
      );
    } else if (icon.svg) {
      return (
        <svg
          {...props}
          dangerouslySetInnerHTML={{ __html: icon.svg }}
          ref={innerRef}
        />
      );
    } else if (icon.path) {
      return (
        <svg {...props} ref={innerRef}>
          <path d={icon.path} />
        </svg>
      );
    } else {
      console.warn(`Icon "${name}" must have an img, svg, or path`);
      return <span ref={innerRef} />;
    }
  }
}

const BaseIconWithRef = forwardRefToInnerRef<IconProps>(BaseIcon);

const StyledIcon = forwardRefToInnerRef<IconProps>(styled(BaseIconWithRef)`
  ${space}
  ${color}
  ${hover}
  flex-shrink: 0
`);

const Icon = forwardRef(function Icon(
  { tooltip, ...props }: IconProps,
  ref?: React.Ref<any>,
) {
  return tooltip ? (
    <Tooltip tooltip={tooltip}>
      <StyledIcon {...props} />
    </Tooltip>
  ) : (
    <StyledIcon ref={ref} {...props} />
  );
});

export default Icon;
