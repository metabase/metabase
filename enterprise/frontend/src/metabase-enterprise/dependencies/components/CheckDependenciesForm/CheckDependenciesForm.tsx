import type { ReactNode } from "react";
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
  Anchor,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";
import visualizations from "metabase/visualizations";
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
            <DependencyItemCard key={index} item={item} />
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

type DependencyItemCardProps = {
  item: DependencyItem;
};

function DependencyItemCard({ item }: DependencyItemCardProps) {
  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="xs">
        <Anchor component={Link} to={getItemLink(item)}>
          <Flex c="brand" align="center" gap="sm">
            <Icon name={getItemIcon(item)} />
            <Box fw="bold">{getItemName(item)}</Box>
          </Flex>
        </Anchor>
        {getItemDescription(item)}
      </Stack>
    </Card>
  );
}

type ContainerLinkProps = {
  to: string;
  children?: ReactNode;
};

function ContainerLink({ to, children }: ContainerLinkProps) {
  return (
    <Anchor component={Link} to={to} c="inherit">
      {children}
    </Anchor>
  );
}

function getItemIcon({ card }: DependencyItem): IconName {
  switch (card.type) {
    case "question":
      return visualizations.get(card.display)?.iconName ?? "table2";
    case "model":
      return "model";
    case "metric":
      return "metric";
  }
}

function getItemName({ card }: DependencyItem) {
  return card.name;
}

function getItemLink({ card }: DependencyItem) {
  return Urls.question(card);
}

function getItemDescription({ card }: DependencyItem) {
  if (card.collection != null) {
    return (
      <Group c="text-secondary" align="center" gap="sm">
        <Icon name="folder" />
        {card.collection.effective_ancestors?.map((parent) => (
          <>
            <ContainerLink key={parent.id} to={Urls.collection(parent)}>
              {parent.name}
            </ContainerLink>
            <Icon name="chevronright" size={8} />
          </>
        ))}
        <ContainerLink
          to={
            card.dashboard != null
              ? Urls.dashboard(card.dashboard)
              : Urls.collection(card.collection)
          }
        >
          {card.dashboard != null ? card.dashboard.name : card.collection.name}
        </ContainerLink>
      </Group>
    );
  }
}
