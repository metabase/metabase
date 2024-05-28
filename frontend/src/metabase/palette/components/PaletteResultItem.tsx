import { useCallback } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Text, Icon, Box } from "metabase/ui";

import type { PaletteActionImpl } from "../types";

interface PaletteResultItemProps {
  item: PaletteActionImpl;
  active: boolean;
  togglePalette: () => void;
}

export const PaletteResultItem = ({
  item,
  active,
  togglePalette,
}: PaletteResultItemProps) => {
  const iconColor = active ? color("brand-light") : color("text-light");

  const parentName =
    item.extra?.parentCollection || item.extra?.database || null;

  const handleLinkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      togglePalette();
    },
    [togglePalette],
  );

  const content = (
    <Flex
      p=".75rem"
      mx="1.5rem"
      miw="0"
      align="center"
      justify="space-between"
      gap="0.5rem"
      fw={700}
      style={{
        cursor: "pointer",
        borderRadius: "0.5rem",
        flexGrow: 1,
        flexBasis: 0,
      }}
      bg={active ? color("brand") : "none"}
      c={active ? color("white") : color("text-dark")}
      aria-label={item.name}
    >
      {/** Icon Container */}
      {item.icon && (
        <Icon
          aria-hidden
          name={item.icon || "click"}
          color={iconColor}
          style={{
            flexBasis: "16px",
          }}
        />
      )}
      {/**Text container */}
      <Flex
        direction="column"
        style={{
          flexGrow: 1,
          flexBasis: 0,
          overflowX: "hidden",
        }}
      >
        <Box
          component="span"
          style={{
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <Text component="span" c="inherit" lh="1rem">
            {item.name}
          </Text>
          {item.extra?.isVerified && (
            <Icon
              name="verified_filled"
              color={active ? color("white") : color("brand")}
              style={{
                verticalAlign: "sub",
                marginLeft: "0.25rem",
              }}
            />
          )}
          {parentName && (
            <Text
              component="span"
              ml="0.25rem"
              c={iconColor}
              fz="0.75rem"
              lh="1rem"
              fw="normal"
            >{`— ${parentName}`}</Text>
          )}
        </Box>
        <Text
          component="span"
          color={active ? "white" : "text-light"}
          fw="normal"
          style={{
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {item.subtitle}
        </Text>
      </Flex>
      {/** Active container */}
      {active && (
        <Flex aria-hidden gap="0.5rem" fw={400}>
          {t`Open`} <Icon name="enter_or_return" />
        </Flex>
      )}
    </Flex>
  );

  if (item.extra?.href) {
    return (
      <Box
        component={Link}
        to={item.extra.href}
        onClick={handleLinkClick}
        w="100%"
      >
        {content}
      </Box>
    );
  } else {
    return content;
  }
};
