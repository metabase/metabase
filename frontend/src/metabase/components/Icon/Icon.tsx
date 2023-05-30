import cx from "classnames";
import PropTypes from "prop-types";
import React, { Component, forwardRef } from "react";
import styled from "@emotion/styled";
import { color, hover, space, SpaceProps } from "styled-system";
import { Tooltip } from "metabase/core/components/Tooltip";
import { loadIcon } from "metabase/icon_paths";
import { color as c } from "metabase/lib/colors";
import { stripLayoutProps } from "metabase/lib/utils";
import { shouldForwardNonTransientProp } from "metabase/lib/styling/emotion";

const MISSING_ICON_NAME = "unknown";

type IconWrapperProps = {
  open?: boolean;
  hover?: React.CSSProperties;
};

export const IconWrapper = styled.div<IconWrapperProps>`
  ${space};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  color: ${props => (props.open ? c("brand") : "inherit")};
  // special cases for certain icons
  // Icon-share has a taller viewbox than most so to optically center
  // the icon we need to translate it upwards
  & > .icon.icon-share {
    transform: translateY(-2px);
  }

  &:hover {
    color: ${({ hover }) => hover?.color ?? c("brand")};
    background-color: ${({ hover }) =>
      hover?.backgroundColor ?? c("bg-medium")};
  }

  transition: all 300ms ease-in-out;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

const stringOrNumberPropType = PropTypes.oneOfType([
  PropTypes.number,
  PropTypes.string,
]);

export const iconPropTypes = {
  name: PropTypes.string.isRequired,
  color: PropTypes.string,
  size: stringOrNumberPropType,
  width: stringOrNumberPropType,
  height: stringOrNumberPropType,
  scale: stringOrNumberPropType,
  tooltip: PropTypes.string,
  className: PropTypes.string,
  onClick: PropTypes.func,
  style: PropTypes.object,
};

export type IconProps = {
  name: string;
  color?: string;
  size?: string | number;
  width?: string | number;
  height?: string | number;
  scale?: string | number;
  tooltip?: string | null;
  onClick?: (event: React.MouseEvent<HTMLImageElement | SVGElement>) => void;

  style?: React.CSSProperties;
  className?: string;
  forwardedRef?: any;
} & SpaceProps;

class BaseIcon extends Component<IconProps> {
  static propTypes = iconPropTypes;

  render() {
    const { name, className, forwardedRef, ...rest } = this.props;

    const icon = loadIcon(name) || loadIcon(MISSING_ICON_NAME);
    if (!icon) {
      console.warn(`Icon "${name}" does not exist.`);
      return <span ref={forwardedRef} />;
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

    // avoid passing `uncheckedColor` to a svg tag
    const { uncheckedColor, ...svgProps } = props;

    if (icon.img) {
      // avoid passing `role="img"` to an actual image file
      const { _role, ...rest } = props;
      return (
        <img
          ref={forwardedRef}
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
        <StyledSVG
          {...svgProps}
          dangerouslySetInnerHTML={{ __html: icon.svg }}
          ref={forwardedRef}
        />
      );
    } else if (icon.path) {
      return (
        <StyledSVG {...svgProps} ref={forwardedRef}>
          <path d={icon.path} />
        </StyledSVG>
      );
    } else {
      console.warn(`Icon "${name}" must have an img, svg, or path`);
      return <span ref={forwardedRef} />;
    }
  }
}

const StyledSVG = styled("svg", {
  shouldForwardProp: shouldForwardNonTransientProp,
})`
  outline: none;
`;

const BaseIconWithRef = forwardRef<HTMLElement, IconProps>(
  function BaseIconWithRef(props, ref) {
    return <BaseIcon {...props} forwardedRef={ref} />;
  },
);

const StyledIcon = styled(BaseIconWithRef)`
  ${space}
  ${color}
  ${hover}
  flex-shrink: 0
`;

const Icon = forwardRef(function Icon(
  { tooltip, ...props }: IconProps,
  ref?: React.Ref<any>,
): JSX.Element {
  return tooltip ? (
    <Tooltip tooltip={tooltip}>
      <StyledIcon {...props} />
    </Tooltip>
  ) : (
    <StyledIcon ref={ref as any} {...props} />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Icon, {
  Root: StyledIcon,
});
