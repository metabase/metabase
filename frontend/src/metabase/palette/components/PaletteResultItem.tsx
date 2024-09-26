import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, Text } from "metabase/ui";
import { Link as RouterLink } from "react-router";

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
          {item.extra?.isVerified && (
            <Icon
              name="verified_filled"
              color={
                active ? "var(--mb-color-text-white)" : "var(--mb-color-brand)"
              }
              style={{
                verticalAlign: "sub",
                marginLeft: "0.25rem",
              }}
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
    const url: string = locationDescriptorToURL(item.extra.href);
    console.log("url", url);
    console.log("isAbsoluteURL(url)", isAbsoluteURL(url));
    // React Router's Link component only supports relative URLs
    const LinkComponent = (
      isAbsoluteURL(url) ? Link : RouterLink
    ) as typeof Link;
    return (
      <Box
        component={LinkComponent}
        to={url}
        target={item.extra.openInNewTab ? "_blank" : undefined}
        role="link"
        w="100%"
        lh={1}
      >
        {content}
      </Box>
    );
  } else {
    return content;
  }
};
