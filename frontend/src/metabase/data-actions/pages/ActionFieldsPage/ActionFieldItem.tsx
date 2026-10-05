import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import { Sortable } from "metabase/common/components/Sortable";
import { Badge, Card, Code, Group, Icon, Stack, Text } from "metabase/ui";

import type { ActionField } from "../../hooks/use-action-fields";

import S from "./ActionFieldItem.module.css";
import { getFieldIcon, getFieldSummary } from "./utils";

type ActionFieldItemProps = {
  field: ActionField;
  href: string;
  isActive: boolean;
  isDraggable: boolean;
};

export function ActionFieldItem({
  field,
  href,
  isActive,
  isDraggable,
}: ActionFieldItemProps) {
  const { parameter, settings, variableName } = field;
  const title = settings.title || parameter.name;

  return (
    <Sortable
      className={S.sortableField}
      id={parameter.id}
      disabled={!isDraggable}
      draggingStyle={{ opacity: 0.5 }}
    >
      <Card
        component={Link}
        to={href}
        aria-label={title}
        role="listitem"
        className={cx(S.card, { [S.active]: isActive })}
        bg={
          isActive
            ? "background_surface-brand-subtle"
            : "background_page-primary"
        }
        px="lg"
        py="md"
        withBorder
      >
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {isDraggable && (
            <Icon className={S.grabber} name="grabber" c="text-tertiary" />
          )}
          <Stack gap="xs" miw={0} flex={1}>
            <Group gap="sm" wrap="nowrap">
              <Icon name={getFieldIcon(settings.fieldType)} c="core-brand" />
              <Text fw="bold" lineClamp={1}>
                {title}
              </Text>
            </Group>
            {settings.description && (
              <Text c="text-secondary" lineClamp={2}>
                {settings.description}
              </Text>
            )}
            <Group gap="sm">
              <Code>{`{{ ${variableName} }}`}</Code>
              <Badge variant="light" color="neutral">
                {getFieldSummary(settings)}
              </Badge>
            </Group>
          </Stack>
        </Group>
      </Card>
    </Sortable>
  );
}
