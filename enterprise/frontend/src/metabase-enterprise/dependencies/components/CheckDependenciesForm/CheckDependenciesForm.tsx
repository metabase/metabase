import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import * as Urls from "metabase/lib/urls";
import type { CheckDependenciesFormProps } from "metabase/plugins";
import {
  Anchor,
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Group,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  Card as ApiCard,
  CheckDependenciesResponse,
  Transform,
} from "metabase-types/api";

import S from "./CheckDependenciesForm.module.css";

type DependencyItem = CardDependencyItem | TransformDependencyItem;

type CardDependencyItem = {
  type: "card";
  card: ApiCard;
};

type TransformDependencyItem = {
  type: "transform";
  transform: Transform;
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
        <Text mb="md" px="xl">
          {t`The items below will break because of these changes:`}
        </Text>
        <Stack className={S.list} mb="xl" px="xl">
          {items.map((item, index) => (
            <DependencyItemCard key={index} item={item} />
          ))}
        </Stack>
        <Group px="xl" wrap="nowrap">
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
  bad_transforms = [],
}: CheckDependenciesResponse): DependencyItem[] {
  return [
    ...bad_transforms.map(
      (transform): TransformDependencyItem => ({
        type: "transform",
        transform,
      }),
    ),
    ...bad_cards.map(
      (card): CardDependencyItem => ({
        type: "card",
        card,
      }),
    ),
  ];
}

type DependencyItemCardProps = {
  item: DependencyItem;
};

function DependencyItemCard({ item }: DependencyItemCardProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={getItemLink(item)}
      p="md"
      shadow="none"
      withBorder
    >
      <Stack className={CS.textWrap} gap="xs">
        <Group c="brand" gap="sm" wrap="nowrap">
          <FixedSizeIcon name={getItemIcon(item)} />
          <Box fw="bold" lh="h4">
            {getItemName(item)}
          </Box>
        </Group>
        {getItemDescription(item)}
      </Stack>
    </Card>
  );
}

function getItemIcon(item: DependencyItem): IconName {
  if (item.type === "card") {
    const { card } = item;

    switch (card.type) {
      case "question":
        return visualizations.get(card.display)?.iconName ?? "table2";
      case "model":
        return "model";
      case "metric":
        return "metric";
    }
  }

  if (item.type === "transform") {
    return "transform";
  }

  return "unknown";
}

function getItemName(item: DependencyItem) {
  switch (item.type) {
    case "card":
      return item.card.name;
    case "transform":
      return item.transform.name;
    default:
      return null;
  }
}

function getItemLink(item: DependencyItem) {
  switch (item.type) {
    case "card":
      return Urls.question(item.card);
    default:
      return Urls.transform(item.transform.id);
  }
}

function getItemDescription(item: DependencyItem) {
  if (item.type === "card") {
    return (
      <Group gap="sm" wrap="nowrap">
        <FixedSizeIcon
          c="text-secondary"
          name={getCardLinkIcon(item)}
          flex="0 0 auto"
        />
        <BreadcrumbList items={getCardBreadcrumbs(item)} />
      </Group>
    );
  }

  if (item.type === "transform") {
    return (
      <Box fz="sm" lh="h5">
        {t`Transform`}
      </Box>
    );
  }

  return null;
}

function getCardBreadcrumbs(item: CardDependencyItem) {
  const { collection, dashboard, document } = item.card;
  if (collection == null) {
    return [];
  }

  const ancestors = collection.effective_ancestors ?? [];
  const breadcrumbs = ancestors.map((ancestor) => ({
    title: ancestor.name,
    to: Urls.collection(ancestor),
  }));
  breadcrumbs.push({ title: collection.name, to: Urls.collection(collection) });
  if (dashboard != null) {
    breadcrumbs.push({ title: dashboard.name, to: Urls.dashboard(dashboard) });
  } else if (document != null) {
    breadcrumbs.push({ title: document.name, to: Urls.document(document) });
  }

  return breadcrumbs;
}

function getCardLinkIcon(item: CardDependencyItem): IconName {
  const { dashboard, document } = item.card;
  if (dashboard != null) {
    return "dashboard";
  }
  if (document != null) {
    return "document";
  }
  return "collection";
}

type BreadcrumbItem = {
  title: string;
  to: string;
};

type BreadcrumbProps = {
  item: BreadcrumbItem;
};

function Breadcrumb({ item }: BreadcrumbProps) {
  return (
    <Anchor
      component={Link}
      className={CS.textWrap}
      to={item.to}
      c="text-secondary"
      fz="sm"
      lh="h5"
    >
      {item.title}
    </Anchor>
  );
}

type BreadcrumbListProps = {
  items: BreadcrumbItem[];
};

function BreadcrumbList({ items }: BreadcrumbListProps) {
  return (
    <Group align="center" gap="xs">
      {items.map((item, itemIndex) => (
        <Fragment key={itemIndex}>
          {itemIndex > 0 && (
            <FixedSizeIcon name="chevronright" c="text-secondary" size={8} />
          )}
          <Breadcrumb item={item} />
        </Fragment>
      ))}
    </Group>
  );
}
