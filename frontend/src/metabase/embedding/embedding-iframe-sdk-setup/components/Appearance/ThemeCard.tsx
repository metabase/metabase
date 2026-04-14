import cx from "classnames";
import type { ReactNode } from "react";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { Box, Group, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./ThemeCard.module.css";

export function getThemeColors(colors?: Partial<MetabaseColors>): string[] {
  return [
    colors?.brand ?? "var(--mb-color-brand)",
    colors?.["text-primary"] ?? "var(--mb-color-text-primary)",
    colors?.background ?? "var(--mb-color-background)",
  ];
}

export function ThemeCard({
  name,
  colors,
  fontFamily,
  icon,
  isSelected,
  onClick,
}: {
  name: string;
  colors: string[];
  fontFamily?: string;
  icon?: ReactNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      data-testid={`theme-card-${name}`}
      className={cx(S.card, isSelected && S.cardSelected)}
      bdrs="md"
      h="42px"
    >
      <Stack gap="xs">
        <Group gap={4} justify="space-between" wrap="nowrap">
          <Text
            size="xs"
            h={12}
            fw={500}
            style={{ fontFamily }}
            truncate
            title={name}
          >
            {name}
          </Text>
          {icon}
        </Group>
        {colors.length > 0 && (
          <Group gap={0} justify="center" className={S.colorBar}>
            {colors.map((color, index) => (
              <Box
                key={index}
                className={S.colorSegment}
                style={{ backgroundColor: String(color) }}
              />
            ))}
          </Group>
        )}
      </Stack>
    </UnstyledButton>
  );
}
