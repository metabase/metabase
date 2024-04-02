import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Text, Icon, Box, type IconName } from "metabase/ui";

import type { PaletteAction } from "../types";

import { CollectionBreadcrumbs } from "./CollectionBreadcrumbs";
import { DatabaseBreadcrumbs } from "./DatabaseBreadcrumb";

interface PaletteResultItemProps {
  item: PaletteAction;
  active: boolean;
}

export const PaletteResultItem = ({ item, active }: PaletteResultItemProps) => {
  const iconColor = active ? color("brand-light") : color("text-light");

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
            overflowX: "hidden",
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
                verticalAlign: "bottom",
                marginLeft: "0.25rem",
              }}
            />
          )}
          {item.extra?.parentCollection && (
            <CollectionBreadcrumbs
              collectionId={item.extra.parentCollection}
              color={iconColor}
            />
          )}
          {item.extra?.databaseId && (
            <DatabaseBreadcrumbs
              databaseId={item.extra.databaseId}
              color={iconColor}
            />
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
