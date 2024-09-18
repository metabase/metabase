import isPropValid from "@emotion/is-prop-valid";
import styled from "@emotion/styled";
import cx from "classnames";
import type { MouseEvent, ReactNode, SVGAttributes } from "react";
import { forwardRef } from "react";

import { Box } from "metabase/ui";

import { Tooltip } from "../../overlays/Tooltip";

import type { IconName } from "./icons";
import { Icons } from "./icons";

const defaultSize = 16;

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: string | number;
  tooltip?: ReactNode;
  onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
  className?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, className, size = defaultSize, tooltip, ...restProps }: IconProps,
  ref,
) {
  const IconComponent = (Icons[name] ?? Icons["unknown"]).component;
  const validProps = Object.fromEntries(
    Object.entries(restProps).filter(([key]) => isPropValid(key)),
  );

  const icon = (
    <IconComponent
      role="img"
      ref={ref}
      aria-label={`${name} icon`}
      className={cx(`Icon Icon-${name}`, className)}
      width={size}
      height={size}
      {...validProps}
    />
  );

  return tooltip ? <Tooltip label={tooltip}>{icon}</Tooltip> : icon;
});

/** An icon that does not shrink when its container is too narrow **/
export const FixedSizeIcon = styled(Icon)`
  flex-shrink: 0;
`;

export const IconBadgeDotThingy = ({
  color,
  active,
}: {
  color: string;
  active: boolean;
}) => (
  <Box
    style={{
      position: "absolute",
      opacity: active ? 1 : 0,
      top: 4,
      right: 4,
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: color,
    }}
  ></Box>
);
