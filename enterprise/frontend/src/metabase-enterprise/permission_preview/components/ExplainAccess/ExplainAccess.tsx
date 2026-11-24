import { skipToken } from "@reduxjs/toolkit/query";
import { t } from "ttag";

import { useGetCardQuery } from "metabase/api/card";
import { useGetCollectionQuery } from "metabase/api/collection";
import { useGetDashboardQuery } from "metabase/api/dashboard";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { parseItem } from "metabase/embedding/permission-preview/item";
import { ActionIcon, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import { useGetPermissionDebugQuery } from "metabase-enterprise/api";
import type {
  IconName,
  PermissionDebugAction,
  UserId,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

import { ExplainAccessBody } from "./ExplainAccessBody";
import { type ExplainedItemType, getSubject } from "./explain";

interface ExplainAccessProps {
  target: PreviewTarget;
  userId: UserId;
  /** The item the frame shows, as `type/id` */
  item: string;
  /** Omitted when the sheet around it has its own close button */
  onClose?: () => void;
}

interface ExplainedItem {
  type: ExplainedItemType;
  id: number;
}

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
  return parsed && typeof parsed.id === "number"
    ? { type: parsed.type, id: parsed.id }
    : null;
}

export function ExplainAccess({
  target,
  userId,
  item,
  onClose,
}: ExplainAccessProps) {
  const explained = getExplainedItem(item);
  const name = useItemName(explained);

  return (
    <Stack gap="md" p="lg" h="100%" style={{ overflowY: "auto" }}>
      <Flex gap="sm" align="flex-start" wrap="nowrap">
        <Box flex={1} miw={0}>
          <Flex gap="sm" align="flex-start" wrap="nowrap">
            {explained && <Icon name={ITEM_ICONS[explained.type]} mt="xs" />}
            <Text fw="bold" size="lg" style={{ overflowWrap: "anywhere" }}>
              {explained ? t`Access to “${name ?? ""}”` : t`Explain access`}
            </Text>
          </Flex>
          <Text c="text-secondary">{t`as ${getSubject(target)}`}</Text>
        </Box>
        {onClose && (
          <ActionIcon aria-label={t`Close`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        )}
      </Flex>
      {explained ? (
        <ExplainedAccess
          target={target}
          userId={userId}
          explained={explained}
        />
      ) : (
        <Text c="text-secondary">
          {t`Open a question, a dashboard or a collection to see why they can or can't open it.`}
        </Text>
      )}
    </Stack>
  );
}

interface ExplainedAccessProps {
  target: PreviewTarget;
  userId: UserId;
  explained: ExplainedItem;
}

function ExplainedAccess({ target, userId, explained }: ExplainedAccessProps) {
  const { type, id } = explained;
  const actions = ACTIONS[type];

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

  return (
    <LoadingAndErrorWrapper
      loading={isLoading}
      error={error ? t`Couldn't explain this access.` : null}
    >
      {read.data && (
        <ExplainAccessBody
          key={`${type}/${id}`}
          itemType={type}
          target={target}
          answers={{
            read: read.data,
            query: query.data,
            download: download.data,
          }}
        />
      )}
    </LoadingAndErrorWrapper>
  );
}

function useItemName(explained: ExplainedItem | null) {
  const card = useGetCardQuery(
    explained?.type === "question" ? { id: explained.id } : skipToken,
  );
  const dashboard = useGetDashboardQuery(
    explained?.type === "dashboard" ? { id: explained.id } : skipToken,
  );
  const collection = useGetCollectionQuery(
    explained?.type === "collection" ? { id: explained.id } : skipToken,
  );
  switch (explained?.type) {
    case "question":
      return card.data?.name;
    case "dashboard":
      return dashboard.data?.name;
    case "collection":
      return collection.data?.name;
  }
}
