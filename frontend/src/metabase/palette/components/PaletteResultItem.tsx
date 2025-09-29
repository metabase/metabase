import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Flex, Icon, Text } from "metabase/ui";

import type { PaletteActionImpl } from "../types";
import {
  getCommandPaletteIcon,
  isAbsoluteURL,
  locationDescriptorToURL,
} from "../utils";

interface PaletteResultItemProps {
  item: PaletteActionImpl;
  active: boolean;
}

export const PaletteResultItem = ({ item, active }: PaletteResultItemProps) => {
  const icon = item.icon ? getCommandPaletteIcon(item) : null;

  const subtext = item.extra?.subtext;

  const content = (
    <Flex
      p=".75rem"
      mx="1.5rem"
      miw="0"
      align="start"
      justify="space-between"
      gap="0.5rem"
      style={{
        cursor: item.disabled ? "default" : "pointer",
        borderRadius: "0.5rem",
        flexGrow: 1,
        flexBasis: 0,
      }}
      bg={active ? "var(--mb-color-background-hover)" : undefined}
      c="var(--mb-color-text-dark)"
      aria-label={item.name}
      aria-disabled={item.disabled ? true : false}
    >
      {/** Icon Container */}
      {icon && (
        <Icon
          {...icon}
          style={{
            flexBasis: "16px",
          }}
        />
      )}
      {/**Text container */}
      <Flex
        direction="column"
        style={{
          gap: 4,
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
          {item.extra?.moderatedStatus && (
            <PLUGIN_MODERATION.ModerationStatusIcon
              status={item.extra.moderatedStatus}
              filled
              size={14}
              color="var(--mb-color-brand)"
              style={{
                verticalAlign: "text-bottom",
              }}
              ml="0.5rem"
            />
          )}
        </Box>

        {item.subtitle && (
          <Text
            c="var(--mb-color-text-light)"
            component="span"
            lh="1rem"
            style={{
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {item.subtitle}
          </Text>
        )}
      </Flex>
      {/** Active container */}
      {subtext && (
        <Text
          component="span"
          ml="0.25rem"
          c="var(--mb-color-text-light)"
          fz="0.75rem"
          lh="1rem"
          style={{
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {subtext}
        </Text>
      )}
    </Flex>
  );
  if (item.extra?.href) {
    const url = locationDescriptorToURL(item.extra.href);
    if (isAbsoluteURL(url)) {
      return (
        <Box
          component={
            // This is needed to make external links work when Metabase is
            // hosted on a subpath
            ExternalLink
          }
          href={url}
          target="_blank"
          role="link"
          w="100%"
          lh={1}
        >
          {content}
        </Box>
      );
    } else {
      return (
        <Box component={Link} to={item.extra.href} role="link" w="100%" lh={1}>
          {content}
        </Box>
      );
    }
  } else {
    return content;
  }
};
