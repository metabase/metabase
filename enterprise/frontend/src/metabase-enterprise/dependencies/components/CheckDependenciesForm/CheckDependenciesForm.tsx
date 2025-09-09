import { Link } from "react-router";
import { t } from "ttag";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import * as Urls from "metabase/lib/urls";
import type {
  CheckDependenciesData,
  CheckDependenciesFormProps,
} from "metabase/plugins";
import {
  Box,
  Button,
  Card,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";
import type { Card as ApiCard } from "metabase-types/api";

type DependencyItem = CardDependencyItem;

type CardDependencyItem = {
  type: "card";
  card: ApiCard;
};

export function CheckDependenciesForm({
  checkData,
  onSave,
  onCancel,
}: CheckDependenciesFormProps) {
  const items = getDependencyItems(checkData);

  return (
    <FormProvider initialValues={{}} onSubmit={onSave}>
      <Form>
        <Text mb="md">{t`The items below will break because of these changes:`}</Text>
        <Stack mb="xl">
          {items.map((item, index) => (
            <DependencyItemLink key={index} item={item} />
          ))}
        </Stack>
        <Group>
          <Box flex={1}>
            <FormErrorMessage />
          </Box>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <FormSubmitButton label={t`Save anyway`} variant="filled" />
        </Group>
      </Form>
    </FormProvider>
  );
}

function getDependencyItems({
  bad_cards = [],
}: CheckDependenciesData): DependencyItem[] {
  return bad_cards.map((card) => ({ type: "card", card }));
}

type DependencyItemLinkProps = {
  item: DependencyItem;
};

function DependencyItemLink({ item }: DependencyItemLinkProps) {
  return (
    <Card
      component={Link}
      to={getItemLink(item)}
      p="md"
      shadow="none"
      withBorder
    >
      <Group gap="sm">
        <Icon c="brand" name={getItemIcon(item)} />
        <Box fw="bold">{getItemName(item)}</Box>
      </Group>
    </Card>
  );
}

function getItemIcon(item: DependencyItem): IconName {
  switch (item.card.type) {
    case "question":
      return "table2";
    case "model":
      return "model";
    case "metric":
      return "metric";
  }
}

function getItemName(item: DependencyItem): string {
  return item.card.name;
}

function getItemLink(item: DependencyItem): string {
  return Urls.question(item.card);
}
