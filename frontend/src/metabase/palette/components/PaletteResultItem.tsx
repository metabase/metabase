import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Text, Icon, Box, type IconName } from "metabase/ui";

import type { PaletteAction } from "../types";

interface PaletteResultItemProps {
  item: PaletteAction;
  active: boolean;
}

export const PaletteResultItem = ({ item, active }: PaletteResultItemProps) => {
  const iconColor = active ? color("brand-light") : color("text-light");

  const parentName =
    item.extra?.parentCollection || item.extra?.database || null;

  return (
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
      <Flex gap=".5rem" style={{ minWidth: 0 }}>
        {item.icon && (
          <Icon
            aria-hidden
            name={(item.icon as IconName) || "click"}
            color={iconColor}
            style={{
              flexBasis: "16px",
            }}
          />
        )}
        <Box
          component="span"
          style={{
            flexGrow: 1,
            flexBasis: 0,
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
      </Flex>
      {active && (
        <Flex
          aria-hidden
          gap="0.5rem"
          fw={400}
          style={{
            flexBasis: 60,
          }}
        >
          {t`Open`} <Icon name="enter_or_return" />
        </Flex>
      )}
    </Flex>
  );
};
