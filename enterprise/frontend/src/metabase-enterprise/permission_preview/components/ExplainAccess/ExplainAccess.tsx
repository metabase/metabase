import { skipToken } from "@reduxjs/toolkit/query";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { useGetCardQuery } from "metabase/api/card";
import { useGetCollectionQuery } from "metabase/api/collection";
import { useGetDashboardQuery } from "metabase/api/dashboard";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { parseItem } from "metabase/embedding/permission-preview/item";
import { Box, Button, Flex, Icon, Stack, Title } from "metabase/ui";
import { useGetPermissionDebugQuery } from "metabase-enterprise/api";
import type {
  IconName,
  PermissionDebugAction,
  PermissionDebugReasons,
  UserId,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

import { ExplainAccessBody } from "./ExplainAccessBody";
import {
  AllCollectionsSheet,
  CollectionSheet,
} from "./ExplainAccessCollections";
import { ExplainAccessDetail, type ExplainDetail } from "./ExplainAccessDetail";
import { BodyText, ItemLine } from "./ExplainAccessParts";
import { ExplainAccessSummary, SummaryHeading } from "./ExplainAccessSummary";
import { type ExplainedItemType, getCollectionName } from "./explain";

interface ExplainAccessProps {
  target: PreviewTarget;
  userId: UserId;
  /** The item the frame shows, as `type/id` */
  item: string;
  /** In a sheet over the frame, which brings its own close button, or beside the frame */
  isSheet?: boolean;
  onClose: () => void;
}

type ExplainedItem =
  | { type: ExplainedItemType; id: number }
  | { type: "all-collections" };

/** A sub-view over the item: a value's reason, or everything the person can access. */
type ExplainView =
  | {
      kind: "detail";
      detail: ExplainDetail;
      /** The summary's own reasons, when the value was opened from the summary */
      reasons?: PermissionDebugReasons;
    }
  | { kind: "summary" };

const ITEM_ICONS: Record<ExplainedItemType, IconName> = {
  question: "table2",
  dashboard: "dashboard",
  collection: "folder",
};

const ACTIONS: Record<
  ExplainedItemType,
  { read: PermissionDebugAction; query?: PermissionDebugAction }
> = {
  question: { read: "card/read", query: "card/query" },
  dashboard: { read: "dashboard/read", query: "dashboard/query" },
  collection: { read: "collection/read" },
};

function getExplainedItem(item: string): ExplainedItem | null {
  const parsed = parseItem(item);
  if (!parsed) {
    return null;
  }
  if (parsed.type === "collection" && typeof parsed.id !== "number") {
    return { type: "all-collections" };
  }
  return typeof parsed.id === "number"
    ? { type: parsed.type, id: parsed.id }
    : null;
}

export function ExplainAccess({
  target,
  userId,
  item,
  isSheet = false,
  onClose,
}: ExplainAccessProps) {
  // The views belong to the item they were opened over
  const [navigation, setNavigation] = useState<{
    item: string;
    views: ExplainView[];
  }>({ item, views: [] });
  const views = navigation.item === item ? navigation.views : [];

  const openView = (view: ExplainView) =>
    setNavigation({ item, views: [...views, view] });
  const goBack = () => setNavigation({ item, views: views.slice(0, -1) });

  const header = (
    <ExplainAccessTitle canGoBack={views.length > 0} onBack={goBack} />
  );
  const content = (
    <ExplainAccessContent
      key={item}
      target={target}
      userId={userId}
      item={item}
      views={views}
      onOpenView={openView}
    />
  );

  if (isSheet) {
    return (
      <Sidesheet
        isOpen
        size="sm"
        withOverlay={false}
        title={header}
        onClose={onClose}
      >
        {content}
      </Sidesheet>
    );
  }
  return (
    <Flex direction="column" h="100%" style={{ overflowY: "auto" }}>
      <Flex px="xl" pt="xl" pb="lg" align="center" gap="sm" wrap="nowrap">
        <Box flex={1} miw={0}>
          {header}
        </Box>
        <Button
          variant="subtle"
          c="text-primary"
          px="sm"
          aria-label={t`Close`}
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
      </Flex>
      <Box px="xl" pb="xl">
        {content}
      </Box>
    </Flex>
  );
}

interface ExplainAccessTitleProps {
  canGoBack: boolean;
  onBack: () => void;
}

/** "Explain access", the same in every view, with Back first in a sub-view. */
function ExplainAccessTitle({ canGoBack, onBack }: ExplainAccessTitleProps) {
  return (
    <Flex align="center" gap="sm" wrap="nowrap">
      {canGoBack && (
        <Button
          variant="subtle"
          size="compact-sm"
          aria-label={t`Back`}
          onClick={onBack}
        >
          <Icon name="chevronleft" />
        </Button>
      )}
      <Title order={4} lh="1.25rem">{t`Explain access`}</Title>
    </Flex>
  );
}

interface ExplainAccessContentProps {
  target: PreviewTarget;
  userId: UserId;
  item: string;
  views: ExplainView[];
  onOpenView: (view: ExplainView) => void;
}

function ExplainAccessContent({
  target,
  userId,
  item,
  views,
  onOpenView,
}: ExplainAccessContentProps) {
  const explained = getExplainedItem(item);

  if (!explained) {
    return (
      <BodyText c="text-secondary">
        {t`Open a question, a dashboard or a collection to see why they can or can't open it.`}
      </BodyText>
    );
  }
  if (explained.type === "all-collections") {
    return (
      <ViewStack
        target={target}
        userId={userId}
        views={views}
        onOpenView={onOpenView}
      >
        <Stack gap="xl">
          <ItemLine icon="folder" name={t`All collections`} target={target} />
          <AllCollectionsSheet
            userId={userId}
            target={target}
            onOpenDetail={(detail) => onOpenView({ kind: "detail", detail })}
            onOpenSummary={() => onOpenView({ kind: "summary" })}
          />
        </Stack>
      </ViewStack>
    );
  }
  return (
    <ExplainedAccess
      target={target}
      userId={userId}
      explained={explained}
      views={views}
      onOpenView={onOpenView}
    />
  );
}

interface ViewStackProps {
  target: PreviewTarget;
  userId: UserId;
  views: ExplainView[];
  /** The reasons of the item's query check, for the values opened from its sheet */
  itemReasons?: PermissionDebugReasons;
  onOpenView: (view: ExplainView) => void;
  children: ReactNode;
}

/** The item's sheet, with the views opened over it. Every one stays mounted under the one on top, so Back finds the sheet as it was. */
function ViewStack({
  target,
  userId,
  views,
  itemReasons,
  onOpenView,
  children,
}: ViewStackProps) {
  const lastIndex = views.length - 1;

  return (
    <>
      <Box display={views.length > 0 ? "none" : undefined}>{children}</Box>
      {views.map((view, index) => (
        <Box key={index} display={index === lastIndex ? undefined : "none"}>
          {view.kind === "summary" ? (
            <Stack gap="xl">
              <SummaryHeading target={target} />
              <ExplainAccessSummary
                userId={userId}
                target={target}
                onOpenDetail={(detail, reasons) =>
                  onOpenView({ kind: "detail", detail, reasons })
                }
              />
            </Stack>
          ) : (
            <Stack gap="xl">
              <ExplainAccessDetail
                detail={view.detail}
                target={target}
                reasons={view.reasons ?? itemReasons}
              />
            </Stack>
          )}
        </Box>
      ))}
    </>
  );
}

interface ExplainedAccessProps {
  target: PreviewTarget;
  userId: UserId;
  explained: Exclude<ExplainedItem, { type: "all-collections" }>;
  views: ExplainView[];
  onOpenView: (view: ExplainView) => void;
}

function ExplainedAccess({
  target,
  userId,
  explained,
  views,
  onOpenView,
}: ExplainedAccessProps) {
  const { type, id } = explained;
  const actions = ACTIONS[type];
  const name = useItemName(explained);

  const read = useGetPermissionDebugQuery({
    user_id: userId,
    model_id: id,
    action_type: actions.read,
  });
  const query = useGetPermissionDebugQuery(
    actions.query
      ? { user_id: userId, model_id: id, action_type: actions.query }
      : skipToken,
  );
  const download = useGetPermissionDebugQuery(
    type === "question"
      ? { user_id: userId, model_id: id, action_type: "card/download-data" }
      : skipToken,
  );

  const error = read.error ?? query.error ?? download.error;
  const isLoading =
    read.isFetching || (type !== "collection" && query.isFetching);
  const collection = read.currentData?.reasons.collection;
  const openDetail = (detail: ExplainDetail) =>
    onOpenView({ kind: "detail", detail });
  const openSummary = () => onOpenView({ kind: "summary" });

  return (
    <ViewStack
      target={target}
      userId={userId}
      views={views}
      itemReasons={query.currentData?.reasons}
      onOpenView={onOpenView}
    >
      <Stack gap="xl">
        <ItemLine
          icon={ITEM_ICONS[type]}
          name={
            type === "collection" && collection
              ? getCollectionName(collection, target)
              : (name ?? "")
          }
          target={target}
        />
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error ? t`Couldn't explain this access.` : null}
        >
          {read.currentData &&
            (type === "collection" ? (
              <CollectionSheet
                collection={collection}
                target={target}
                onOpenDetail={openDetail}
                onOpenSummary={openSummary}
              />
            ) : (
              <ExplainAccessBody
                itemType={type}
                target={target}
                answers={{
                  read: read.currentData,
                  query: query.currentData,
                  download: download.currentData,
                }}
                onOpenDetail={openDetail}
                onOpenSummary={openSummary}
              />
            ))}
        </LoadingAndErrorWrapper>
      </Stack>
    </ViewStack>
  );
}

function useItemName(explained: { type: ExplainedItemType; id: number }) {
  const card = useGetCardQuery(
    explained.type === "question" ? { id: explained.id } : skipToken,
  );
  const dashboard = useGetDashboardQuery(
    explained.type === "dashboard" ? { id: explained.id } : skipToken,
  );
  const collection = useGetCollectionQuery(
    explained.type === "collection" ? { id: explained.id } : skipToken,
  );
  switch (explained.type) {
    case "question":
      return card.currentData?.name;
    case "dashboard":
      return dashboard.currentData?.name;
    case "collection":
      return collection.currentData?.name;
  }
}
