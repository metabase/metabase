import { type ReactNode, useCallback, useState } from "react";

import { Box, Ellipsified, Flex, Icon, type IconProps } from "metabase/ui";

import { LegendLabel } from "../legend/LegendLabel";

import S from "./ScalarValue.module.css";

interface ScalarTitleProps {
  size?: "sm" | "md";
  children: ReactNode;
  icon?: IconProps | null;
  getHref?: () => string | undefined;
  onSelectTitle?: () => void;
}

export const ScalarTitle = ({
  size = "md",
  children,
  icon,
  getHref,
  onSelectTitle,
}: ScalarTitleProps) => {
  const [href, setHref] = useState(() => getHref?.());
  const computeHref = useCallback(() => {
    if (getHref) {
      setHref(getHref());
    }
  }, [getHref]);

  const title = <Ellipsified tooltip={children}>{children}</Ellipsified>;

  return (
    <Flex
      align="center"
      justify="center"
      gap="xxs"
      maw="100%"
      miw={0}
      data-testid="scalar-title"
    >
      {icon && (
        <Icon
          className={S.titleIcon}
          name={icon.name}
          color={icon.color}
          size={icon.size}
          tooltip={icon.tooltip}
        />
      )}
      <Box fz={size} lh={size} fw={700} c="text-primary" ta="center" miw={0}>
        {onSelectTitle ? (
          <LegendLabel
            className={S.titleLink}
            href={href}
            onClick={onSelectTitle}
            onFocus={computeHref}
            onMouseEnter={computeHref}
            onMouseDown={computeHref}
            onTouchStart={computeHref}
          >
            {title}
          </LegendLabel>
        ) : (
          title
        )}
      </Box>
    </Flex>
  );
};
