import cx from "classnames";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors/types";
import {
  Box,
  Card,
  FixedSizeIcon,
  Flex,
  type IconName,
  Title,
} from "metabase/ui";

const sizeOptions = {
  md: {
    height: "4rem",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: "0.5rem",
    iconSize: 16,
  },
  lg: {
    height: "8.5rem",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "2.5rem",
    iconSize: 32,
  },
};

export const BrowseCard = ({
  icon,
  to,
  iconColor = "brand",
  title,
  size = "md",
  children,
  onClick,
}: {
  icon: IconName;
  to: string;
  iconColor?: ColorName;
  title: string;
  size?: "md" | "lg";
  children?: React.ReactNode;
  onClick?: () => void;
}) => {
  return (
    <Card
      withBorder
      shadow="none"
      component={Link}
      to={to}
      onClick={onClick}
      h={sizeOptions[size].height}
      p="1.5rem"
      classNames={{
        root: cx(
          CS.bgBrandLighterHover,
          CS.hoverParent,
          CS.hoverDisplay,
          CS.textBrandHover,
        ),
      }}
    >
      <Flex
        direction={sizeOptions[size].flexDirection}
        align={sizeOptions[size].alignItems}
        justify="space-between"
        gap="sm"
        h="100%"
        w="100%"
      >
        <FixedSizeIcon
          name={icon}
          c={iconColor}
          size={sizeOptions[size].iconSize}
        />
        <Ellipsified>
          <Title
            order={2}
            size="md"
            lh={1.2}
            display="inline"
            style={{ overflow: "hidden" }}
            w="100%"
          >
            {title}
          </Title>
        </Ellipsified>
        {size === "md" && (
          <Box ml="auto" style={{ flexShrink: 0 }}>
            {children}
          </Box>
        )}
      </Flex>
    </Card>
  );
};
