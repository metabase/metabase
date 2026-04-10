import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
  useListNotificationsQuery,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { getLibraryCollectionType } from "metabase/data-studio/utils";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { QuestionAlertListModal } from "metabase/notifications/modals/QuestionAlertListModal";
import { PLUGIN_AUDIT, PLUGIN_MODERATION } from "metabase/plugins";
import { AddToDashSelectDashModal } from "metabase/query_builder/components/AddToDashSelectDashModal";
import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { CardCopyModal } from "metabase/questions/components/CardCopyModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { Button, Group, Icon, Menu } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../../types";

type MetricModalType =
  | "move"
  | "copy"
  | "archive"
  | "add-to-dashboard"
  | "alert";

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
  showDataStudioLink,
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

  const isInLibrary =
    showDataStudioLink &&
    getLibraryCollectionType(card.collection?.type) != null;

  return (
    <Group wrap="nowrap" gap="sm">
      {isNumericMetric(card) && (
        <Button
          size="sm"
          component={ForwardRefLink}
          to={Urls.exploreMetric(card.id)}
          target="_blank"
          leftSection={<Icon name="external" />}
          data-testid="explore-link"
        >
          {t`Explore`}
        </Button>
      )}
      <Menu position="bottom-end">
        <Menu.Target>
          <ToolbarButton icon="ellipsis" aria-label={t`More options`} />
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

          {(PLUGIN_AUDIT.isEnabled || isInLibrary) && (
            <Menu.Divider role="separator" />
          )}

          {isInLibrary && (
            <Menu.Item
              leftSection={<Icon name="grid_bordered" />}
              onClick={() => dispatch(openUrl(Urls.dataStudioMetric(card.id)))}
            >
              {t`Open in Data Studio`}
            </Menu.Item>
          )}
          <PLUGIN_AUDIT.InsightsMenuItem
            card={card}
            label={t`Metric usage analytics`}
            iconName="pie_slice"
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
    </Group>
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
    default:
      return null;
  }
}
