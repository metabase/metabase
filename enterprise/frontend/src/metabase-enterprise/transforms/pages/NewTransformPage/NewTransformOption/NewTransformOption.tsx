import { Link } from "react-router";

import { Box, Card, Flex, Group, Icon, type IconName, rem } from "metabase/ui";

import S from "./NewTransformOption.module.css";

type NewTransformOptionProps = {
  icon: IconName;
  label: string;
  description?: string;
  link?: string;
  onClick?: () => void;
};

export function NewTransformOption({
  icon,
  label,
  description,
  link,
  onClick,
}: NewTransformOptionProps) {
  return (
    <Card className={S.card} p={0} withBorder onClick={onClick}>
      <Flex
        component={Link}
        direction="column"
        p="md"
        gap={rem(12)}
        to={link ?? ""}
        {...{ link }}
      >
        <Group gap="sm">
          <Icon name={icon} c="brand" />
          <Box fw="bold">{label}</Box>
        </Group>
        <Box>{description}</Box>
      </Flex>
    </Card>
  );
}
