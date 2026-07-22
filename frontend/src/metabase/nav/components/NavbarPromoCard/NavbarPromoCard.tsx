import type { ReactNode } from "react";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Link } from "metabase/router";
import { Anchor, Flex, Icon, Paper, Stack, Text } from "metabase/ui";

import S from "./NavbarPromoCard.module.css";

type Props = {
  icon?: ReactNode;
  title?: string;
  body?: ReactNode;
  // A promo card can either link out via a dedicated `linkText` + target, or
  // carry links inline in its `body` (e.g. rendered markdown), in which case
  // the dedicated link is omitted.
  linkText?: string;
  linkTo?: string;
  linkHref?: string;
  onDismiss?: () => void;
  external?: boolean;
};

export function NavbarPromoCard({
  icon,
  title,
  body,
  linkText,
  linkTo,
  linkHref,
  onDismiss,
  external,
}: Props) {
  return (
    <Paper p="md" shadow="md" withBorder>
      <Stack gap="sm">
        <Flex justify="space-between" align="flex-start">
          <Flex gap="sm">
            {icon ? <span className={S.IconWrapper}>{icon}</span> : null}
            {title && (
              <Text fw="bold" size="md">
                {title}
              </Text>
            )}
          </Flex>
          {onDismiss && (
            <IconButtonWrapper
              className={S.DismissIconButtonWrapper}
              onClick={onDismiss}
            >
              <Icon name="close" />
            </IconButtonWrapper>
          )}
        </Flex>

        <Stack gap={4}>
          {body && (
            <Text component="div" className={S.Body} size="sm">
              {body}
            </Text>
          )}
        </Stack>

        {linkText && linkHref && (
          <Anchor
            component="a"
            href={linkHref}
            size="sm"
            fw="bold"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {linkText}
          </Anchor>
        )}
        {linkText && !linkHref && linkTo && (
          <Anchor component={Link} to={linkTo} size="sm" fw="bold">
            {linkText}
          </Anchor>
        )}
      </Stack>
    </Paper>
  );
}
