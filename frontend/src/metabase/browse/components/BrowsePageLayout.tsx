import cx from "classnames";
import type { ReactNode } from "react";

import { Flex, Group, Icon, Stack, Text, Title } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./BrowseContainer.module.css";
import Layout from "./BrowsePageLayout.module.css";

export type BrowsePageLayoutProps = {
  icon: IconName;
  title: string;
  titleId: string;
  /** Dot-separated facts under the title. Falsy entries are dropped. */
  meta?: (string | false | null | undefined)[];
  /** One explanatory paragraph under the meta row. */
  description?: string;
  /** Right-aligned header controls. */
  actions?: ReactNode;
  testId: string;
  children: ReactNode;
};

export function BrowsePageLayout({
  icon,
  title,
  titleId,
  meta,
  description,
  actions,
  testId,
  children,
}: BrowsePageLayoutProps) {
  const facts = meta?.filter((fact): fact is string => Boolean(fact)) ?? [];

  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="lg"
      aria-labelledby={titleId}
    >
      <Flex
        className={cx(S.browseHeader, Layout.header)}
        direction="column"
        role="heading"
        data-testid={testId}
      >
        <Stack maw="64rem" mx="auto" w="100%" gap="sm">
          <Flex w="100%" mih="2.25rem" justify="space-between" align="center">
            <Title order={1} c="text-primary" id={titleId}>
              <Group gap="sm">
                <Icon size={24} c="icon-brand" name={icon} />
                {title}
              </Group>
            </Title>
            <Group gap="xxs">{actions}</Group>
          </Flex>
          {facts.length > 0 && (
            <Group gap="xs">
              {facts.map((fact, index) => (
                <Group gap="xs" key={fact}>
                  {index > 0 && <Text c="text-tertiary">·</Text>}
                  <Text size="sm" c="text-secondary">
                    {fact}
                  </Text>
                </Group>
              ))}
            </Group>
          )}
          {description && (
            <Text size="sm" c="text-secondary" maw="48rem">
              {description}
            </Text>
          )}
        </Stack>
      </Flex>
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%">
          <Stack mb="xl" gap="lg" w="100%">
            {children}
          </Stack>
        </Flex>
      </Flex>
    </Flex>
  );
}
