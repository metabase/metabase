import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
  useListNotificationsQuery,
} from "metabase/api";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { canAccessDataStudio as canAccessDataStudioSelector } from "metabase/common/data-studio/selectors";
import type { MetricUrls } from "metabase/common/metrics/types";
import { QuestionAlertListModal } from "metabase/notifications/modals/QuestionAlertListModal";
import {
  PLUGIN_AUDIT,
  PLUGIN_CACHING,
  PLUGIN_LIBRARY,
  PLUGIN_MODERATION,
} from "metabase/plugins";
import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { CardCopyModal } from "metabase/questions/components/CardCopyModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import { useDispatch, useSelector } from "metabase/redux";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./MetricToolbar.module.css";

type MetricModalType =
  | "move"
  | "copy"
  | "archive"
  | "add-to-dashboard"
  | "alert"
  | "caching";

interface MetricToolbarProps {
  card: Card;
  urls: MetricUrls;
  showDataStudioLink: boolean;
}

export function MetricToolbar({
  card,
  urls,
  showDataStudioLink,
}: MetricToolbarProps) {
  const [modalType, setModalType] = useState<MetricModalType>();

  return (
    <>
      <MetricToolbarButtons
        card={card}
        showDataStudioLink={showDataStudioLink}
        onOpenModal={setModalType}
      />
      {modalType != null && (
        <MetricModal
          card={card}
          urls={urls}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

interface MetricToolbarButtonsProps {
  card: Card;
  showDataStudioLink: boolean;
  onOpenModal: (modalType: MetricModalType) => void;
}

function MetricToolbarButtons({
  card,
  showDataStudioLink: showDataStudioLinkProp,
  onOpenModal,
}: MetricToolbarButtonsProps) {
  const metadata = useSelector(getMetadata);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const { data: bookmarks = [] } = useListBookmarksQuery();
  const { data: questionNotifications, isLoading: isNotificationsLoading } =
    useListNotificationsQuery({
      card_id: card.id,
      include_inactive: false,
    });
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();
  const moderationMenuItems = PLUGIN_MODERATION.useCardMenuItems(card);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  const isBookmarked = bookmarks.some(
    (bookmark) => bookmark.type === "card" && bookmark.item_id === card.id,
  );

  const dispatch = useDispatch();

  const canAccessDataStudio = useSelector(canAccessDataStudioSelector);

  const showDataStudioLink =
    showDataStudioLinkProp &&
    PLUGIN_LIBRARY.isLibraryCollectionType(card.collection?.type) &&
    canAccessDataStudio;

  const isCacheableQuestion =
    card.can_write &&
    PLUGIN_CACHING.isGranularCachingEnabled() &&
    PLUGIN_CACHING.hasQuestionCacheSection(new Question(card));

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          className={S.moreOptionsButton}
          aria-label={t`More options`}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={
            <Icon name={isBookmarked ? "bookmark_filled" : "bookmark"} />
          }
          onClick={() =>
            isBookmarked
              ? deleteBookmark({ id: card.id, type: "card" })
              : createBookmark({ id: card.id, type: "card" })
          }
        >
          {isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}
        </Menu.Item>
        {moderationMenuItems}
        {card.can_write && (
          <Menu.Item
            leftSection={<Icon name="move" />}
            onClick={() => onOpenModal("move")}
          >
            {c("A verb, not a noun").t`Move`}
          </Menu.Item>
        )}
        {queryInfo.isEditable && (
          <Menu.Item
            leftSection={<Icon name="clone" />}
            onClick={() => onOpenModal("copy")}
          >
            {c("A verb, not a noun").t`Duplicate`}
          </Menu.Item>
        )}

        <Menu.Divider role="separator" />

        <Menu.Item
          leftSection={<Icon name="add_to_dash" />}
          onClick={() => onOpenModal("add-to-dashboard")}
        >
          {t`Add to a dashboard`}
        </Menu.Item>
        {canManageSubscriptions && (
          <Menu.Item
            leftSection={<Icon name="alert" />}
            disabled={isNotificationsLoading}
            onClick={() => onOpenModal("alert")}
          >
            {questionNotifications?.length
              ? t`Edit alerts`
              : t`Create an alert`}
          </Menu.Item>
        )}

        {isCacheableQuestion && (
          <>
            <Menu.Divider role="separator" />
            <Menu.Item
              leftSection={<Icon name="sync" />}
              onClick={() => onOpenModal("caching")}
            >
              {t`Caching`}
            </Menu.Item>
          </>
        )}

        {showDataStudioLink && (
          <>
            <Menu.Divider role="separator" />
            <Menu.Item
              leftSection={<Icon name="grid_bordered" />}
              onClick={() => dispatch(openUrl(Urls.dataStudioMetric(card.id)))}
            >
              {t`Open in Data Studio`}
            </Menu.Item>
          </>
        )}
        <PLUGIN_AUDIT.InsightsMenuItem
          card={card}
          label={t`Metric usage analytics`}
          iconName="pie_slice"
          withDivider={!showDataStudioLink}
        />

        {card.can_write && (
          <>
            <Menu.Divider role="separator" />
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={() => onOpenModal("archive")}
            >
              {t`Move to trash`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface MetricModalProps {
  card: Card;
  urls: MetricUrls;
  modalType: MetricModalType;
  onClose: () => void;
}

function MetricModal({ card, urls, modalType, onClose }: MetricModalProps) {
  const dispatch = useDispatch();

  const handleCopy = (newCard: Card) => {
    dispatch(push(urls.about(newCard.id)));
  };

  switch (modalType) {
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "copy":
      return (
        <CardCopyModal card={card} onCopy={handleCopy} onClose={onClose} />
      );
    case "archive":
      return <ArchiveCardModal card={card} onClose={onClose} />;
    case "add-to-dashboard":
      return (
        <AddToDashSelectDashModal
          card={card}
          onClose={onClose}
          onChangeLocation={(location) => dispatch(push(location))}
        />
      );
    case "alert":
      return (
        <QuestionAlertListModal
          question={new Question(card)}
          onClose={onClose}
        />
      );
    case "caching":
      return (
        <PLUGIN_CACHING.MetricCachingModal
          cardId={card.id}
          cardName={card.name}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
