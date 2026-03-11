import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { DefinitionState } from "metabase/metrics/components/MetricDefinitionSection";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { CardCopyModal } from "metabase/questions/components/CardCopyModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import { getMetadata } from "metabase/selectors/metadata";
import { getLocation } from "metabase/selectors/routing";
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

type MetricHomeHeaderProps = {
  card: Card;
  definitionState?: DefinitionState | null;
};

type MetricModalType = "move" | "copy" | "archive";

export function MetricHomeHeader({
  card,
  definitionState,
}: MetricHomeHeaderProps) {
  const [modalType, setModalType] = useState<MetricModalType>();
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  const { data: libraryCollection } =
    PLUGIN_LIBRARY.useGetLibraryCollection();

  const isInLibrary = useMemo(() => {
    if (!libraryCollection || !path) {
      return false;
    }
    return path.some(
      (collection) =>
        collection.type === "library" ||
        collection.type === "library-data" ||
        collection.type === "library-metrics",
    );
  }, [libraryCollection, path]);

  return (
    <>
      <Stack gap={0} pt="xs">
        <Flex mb="lg" mt="md" w="100%">
          {!isLoadingPath && path && (
            <Breadcrumbs>
              {path.map((collection) => (
                <Link key={collection.id} to={Urls.collection(collection)}>
                  {collection.name}
                </Link>
              ))}
              <span>{card.name}</span>
            </Breadcrumbs>
          )}
        </Flex>
        <Group gap="sm" justify="space-between" wrap="nowrap">
          <Stack gap="md">
            <Group align="center" gap="sm" wrap="nowrap">
              <FixedSizeIcon name="metric" c="brand" size={20} />
              <MetricName card={card} />
              <MetricHomeMoreMenu card={card} onOpenModal={setModalType} />
            </Group>
            <MetricHomeTabs card={card} />
          </Stack>
          <MetricHomeActions
            definitionState={definitionState}
            cardId={card.id}
            isInLibrary={isInLibrary}
          />
        </Group>
      </Stack>
      {modalType != null && (
        <MetricHomeModal
          card={card}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type MetricHomeActionsProps = {
  cardId: number;
  definitionState?: DefinitionState | null;
  isInLibrary: boolean;
};

function MetricHomeActions({
  cardId,
  definitionState,
  isInLibrary,
}: MetricHomeActionsProps) {
  if (definitionState?.isDirty) {
    const canSave =
      definitionState.isDirty &&
      definitionState.isValid &&
      !definitionState.isSaving;

    return (
      <Group wrap="nowrap">
        <Button onClick={definitionState.onCancel}>{t`Cancel`}</Button>
        <Tooltip
          label={definitionState.errorMessage}
          disabled={definitionState.errorMessage == null}
        >
          <Button
            variant="filled"
            disabled={!canSave}
            onClick={definitionState.onSave}
          >
            {t`Save`}
          </Button>
        </Tooltip>
      </Group>
    );
  }

  return (
    <Group wrap="nowrap">
      {isInLibrary && (
        <Button
          component={ForwardRefLink}
          to={Urls.dataStudioMetric(cardId)}
          variant="default"
          leftSection={<Icon name="data_studio" />}
        >
          {t`View in Data Studio`}
        </Button>
      )}
      <Button
        component={ForwardRefLink}
        to={Urls.exploreMetric(cardId)}
        variant="default"
      >
        {t`Explore`}
      </Button>
    </Group>
  );
}

type MetricHomeTabsProps = {
  card: Card;
};

function MetricHomeTabs({ card }: MetricHomeTabsProps) {
  const { pathname } = useSelector(getLocation);
  const metadata = useSelector(getMetadata);
  const metricUrl = Urls.metric(card);

  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  const tabs = [
    { label: t`About`, to: metricUrl },
    { label: t`Overview`, to: `${metricUrl}/overview` },
  ];

  if (queryInfo.isEditable) {
    tabs.push({ label: t`Definition`, to: `${metricUrl}/definition` });
  }

  return (
    <Group gap="sm">
      {tabs.map(({ label, to }) => {
        const selected = to === pathname;
        return (
          <Button
            key={label}
            component={Link}
            to={to}
            size="sm"
            radius="xl"
            c={selected ? "brand" : undefined}
            bg={selected ? "background-selected" : "transparent"}
            bd="none"
          >
            {label}
          </Button>
        );
      })}
    </Group>
  );
}

const NAME_MAX_LENGTH = 254;

type MetricNameProps = {
  card: Card;
};

function MetricName({ card }: MetricNameProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateCard({ id: card.id, name: newName });
    if (error) {
      sendErrorToast(t`Failed to update metric name`);
    } else {
      sendSuccessToast(t`Metric name updated`);
    }
  };

  if (card.can_write) {
    return (
      <EditableText
        initialValue={card.name}
        maxLength={NAME_MAX_LENGTH}
        p={0}
        fw="bold"
        fz="h3"
        lh="h3"
        onChange={handleChangeName}
      />
    );
  }

  return (
    <Box fw="bold" fz="h3" lh="h3">
      {card.name}
    </Box>
  );
}

type MetricHomeMoreMenuProps = {
  card: Card;
  onOpenModal: (modalType: MetricModalType) => void;
};

function MetricHomeMoreMenu({ card, onOpenModal }: MetricHomeMoreMenuProps) {
  const menuItems: ReactNode[] = [];
  const metadata = useSelector(getMetadata);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  if (card.can_write) {
    menuItems.push(
      <Menu.Item
        key="move"
        leftSection={<Icon name="move" />}
        onClick={() => onOpenModal("move")}
      >
        {c("A verb, not a noun").t`Move`}
      </Menu.Item>,
    );
  }

  if (queryInfo.isEditable) {
    menuItems.push(
      <Menu.Item
        key="duplicate"
        leftSection={<Icon name="clone" />}
        onClick={() => onOpenModal("copy")}
      >
        {c("A verb, not a noun").t`Duplicate`}
      </Menu.Item>,
    );
  }

  if (card.can_write) {
    menuItems.push(
      <Menu.Item
        key="archive"
        leftSection={<Icon name="trash" />}
        onClick={() => onOpenModal("archive")}
      >
        {t`Move to trash`}
      </Menu.Item>,
    );
  }

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon size="sm">
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
}

type MetricHomeModalProps = {
  card: Card;
  modalType: MetricModalType;
  onClose: () => void;
};

function MetricHomeModal({ card, modalType, onClose }: MetricHomeModalProps) {
  const dispatch = useDispatch();

  const handleCopy = (newCard: Card) => {
    dispatch(push(Urls.metric(newCard)));
  };

  const handleArchive = () => {
    dispatch(push("/"));
  };

  const handleUnarchive = () => {
    dispatch(push(Urls.metric(card)));
  };

  switch (modalType) {
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "copy":
      return (
        <CardCopyModal card={card} onCopy={handleCopy} onClose={onClose} />
      );
    case "archive":
      return (
        <ArchiveCardModal
          card={card}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
