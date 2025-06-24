import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
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
  const icon = item.icon ? getCommandPaletteIcon(item, active) : null;

  const subtext = item.extra?.subtext;

  const content = (
    <Flex
      p=".75rem"
      mx="1.5rem"
      miw="0"
      align="start"
      justify="space-between"
      gap="0.5rem"
      fw={700}
      style={{
        cursor: item.disabled ? "default" : "pointer",
        borderRadius: "0.5rem",
        flexGrow: 1,
        flexBasis: 0,
      }}
      bg={active ? "var(--mb-color-brand)" : undefined}
      c={active ? "var(--mb-color-text-white)" : "var(--mb-color-text-dark)"}
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
              color={
                active ? "var(--mb-color-text-white)" : "var(--mb-color-brand)"
              }
              style={{
                verticalAlign: "text-bottom",
              }}
              ml="0.5rem"
            />
          )}
          {subtext && (
            <Text
              component="span"
              ml="0.25rem"
              c={
                active
                  ? "var(--mb-color-brand-light)"
                  : "var(--mb-color-text-light)"
              }
              fz="0.75rem"
              lh="1rem"
              fw="normal"
              style={{
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              — {subtext}
            </Text>
          )}
        </Box>
        <Text
          component="span"
          color={
            active ? "var(--mb-color-text-white)" : "var(--mb-color-text-light)"
          }
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
