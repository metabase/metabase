import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Card,
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Stack,
  Title,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import S from "./BrowseCard.module.css";

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
  iconColor = "core-brand",
  title,
  size = "md",
  description,
  className,
  children,
  onClick,
}: {
  icon: IconName | React.ReactElement;
  to: string;
  iconColor?: ColorName;
  title: string;
  size?: "md" | "lg";
  description?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) => {
  return (
    <Card
      data-testid="browse-card"
      withBorder
      shadow="none"
      radius="sm"
      h={sizeOptions[size].height}
      p="1.5rem"
      classNames={{
        root: cx(
          CS.bgBrandHover,
          CS.hoverParent,
          CS.hoverVisibility,
          CS.textBrandHover,
          S.card,
          className,
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
        {typeof icon === "string" ? (
          <FixedSizeIcon
            name={icon}
            c={iconColor}
            size={sizeOptions[size].iconSize}
          />
        ) : (
          icon
        )}
        <Stack gap="xs" miw={0} maw="100%">
          <Link to={to} onClick={onClick} className={S.link}>
            {/* Plain-text label: the nowrap <Title> would stop long names wrapping in the tooltip */}
            <Ellipsified className={S.title} tooltip={title}>
              <Title
                order={2}
                size="md"
                lh={1.2}
                display="inline"
                textWrap="nowrap"
                style={{ overflow: "hidden" }}
                w="100%"
              >
                {title}
              </Title>
            </Ellipsified>
          </Link>
          {description}
        </Stack>
        <Box
          ml="auto"
          style={{ flexShrink: 0 }}
          className={cx(S.actions, { [S.cornerActions]: size === "lg" })}
        >
          {children}
        </Box>
      </Flex>
    </Card>
  );
};
