import { useElementSize } from "@mantine/hooks";
import { useEffect, useState } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Text } from "metabase/ui";

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

const NAME_LINE_HEIGHT = 16;

export const PaletteResultItem = ({ item, active }: PaletteResultItemProps) => {
  const icon = item.icon ? getCommandPaletteIcon(item) : null;
  const subtext = item.extra?.subtext;
  const [hideSubtext, setHideSubtext] = useState(false);

  const nameElement = useElementSize();

  useEffect(() => {
    if (!hideSubtext && nameElement.height > 0) {
      // hide subtext if there's no room for it
      setHideSubtext(nameElement.height > NAME_LINE_HEIGHT);
    }
  }, [hideSubtext, nameElement.height]);

  const content = (
    <Flex
      p=".75rem"
      mx="1.5rem"
      miw="0"
      align="start"
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
      wrap="nowrap"
    >
      {icon && (
        <Icon
          {...icon}
          style={{
            flexBasis: "16px",
          }}
        />
      )}

      <Stack gap="xs" flex="1" style={{ overflow: "hidden" }}>
        <Flex align="center" gap="sm" justify="space-between" wrap="nowrap">
          <Group align="center" gap="sm" wrap="nowrap">
            <Text
              c="inherit"
              component="span"
              lh="1rem"
              lineClamp={hideSubtext ? 1 : undefined}
              miw={0}
              ref={nameElement.ref}
            >
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
              />
            )}
          </Group>

          {subtext && !hideSubtext && (
            <Text
              flex="0 0 auto"
              c={
                active
                  ? "var(--mb-color-text-medium)"
                  : "var(--mb-color-text-light)"
              }
              fz="0.75rem"
              lh="1rem"
            >
              {subtext}
            </Text>
          )}
        </Flex>

        {item.subtitle && (
          <Text
            c={
              active
                ? "var(--mb-color-text-medium)"
                : "var(--mb-color-text-light)"
            }
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
      </Stack>
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
