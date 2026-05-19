import type { ReactNode } from "react";
import { Link } from "react-router";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Anchor, Flex, Icon, Paper, Stack, Text } from "metabase/ui";

import S from "./NavbarPromoCard.module.css";

type LinkTarget =
  | { linkTo: string; linkHref?: never }
  | { linkHref: string; linkTo?: never };

type Props = {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  linkText: string;
  onDismiss?: () => void;
  external?: boolean;
} & LinkTarget;

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
          <span className={S.IconWrapper}>{icon}</span>
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
          <Text fw="bold" size="sm">
            {title}
          </Text>
          {body && (
            <Text className={S.Body} size="sm">
              {body}
            </Text>
          )}
        </Stack>

        {linkHref ? (
          <Anchor
            component="a"
            href={linkHref}
            size="sm"
            fw="bold"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {linkText}
          </Anchor>
        ) : (
          <Anchor component={Link} to={linkTo as string} size="sm" fw="bold">
            {linkText}
          </Anchor>
        )}
      </Stack>
    </Paper>
  );
}
