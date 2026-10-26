import { useMemo, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import {
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useListBookmarksQuery,
  useListNotificationsQuery,
} from "metabase/api";
import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { QuestionDownloadWidget } from "metabase/common/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/common/components/QuestionDownloadWidget/use-download-data";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { canDownloadResults } from "metabase/common/utils/dataset";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/current-user";
import { QuestionPublicLinkPopover } from "metabase/embedding/components/QuestionPublicLinkPopover/QuestionPublicLinkPopover";
import { InviteToViewModal } from "metabase/embedding/components/SharingMenu/InviteToViewModal";
import {
  COPY_TIMEOUT_MS,
  LinkCopiedTooltipLabel,
} from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
import { CopyPublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/CopyPublicLinkMenuItem";
import { InviteToViewMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/InviteToViewMenuItem";
import { PublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import type { QuestionSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSharingModal } from "metabase/embedding/hooks/use-sharing-modal";
import { trackPublicLinkCopied } from "metabase/embedding/lib/analytics";
import { useMetadataProvider } from "metabase/metadata-store";
import { QuestionAlertListModal } from "metabase/notifications/modals/QuestionAlertListModal";
import { PLUGIN_CACHING, PLUGIN_MODERATION } from "metabase/plugins";
import {
  getCopyIneligibleReason,
  getCopyMode,
  useCopyResults,
} from "metabase/querying/common/hooks/use-copy-results";
import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { CardCopyModal } from "metabase/questions/components/CardCopyModal";
import { MoveCardModal } from "metabase/questions/components/MoveCardModal";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Box, CopyButton, Flex, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { AnalysisInfoSidesheet } from "./AnalysisInfoSidesheet";

type ModalType =
  | "add-to-dashboard"
  | "alert"
  | "caching"
  | "move"
  | "copy"
  | "archive"
  | "invite"
  | "public-link";

type EventsToggle = { isOpen: boolean; onToggle: () => void };

type AnalysisActionsMenuProps = {
  /** Undefined for a new analysis, which only has copy, download and Events. */
  savedCard: Card | undefined;
  /** After a revision is restored from More info's History. */
  onReverted: () => void;
  /** The chart's series; its card is what downloads and copies go through. */
  rawSeries: RawSeries | null;
  /** Undefined while there's no finished result. */
  dataset: Dataset | undefined;
  vizSettings: VisualizationSettings;
  /** For time series charts; undefined hides the Events item. */
  events: EventsToggle | undefined;
};

/**
 * The analysis's "…" menu: everything the query builder puts in its header,
 * footer and "…" menu. More info; then where the analysis and its results can
 * go (dashboard, alert, bookmarks, Share, clipboard, download, Events); then
 * its settings (verification, caching); then where it lives (move,
 * duplicate, trash). A trashed analysis keeps More info and the results.
 */
export const AnalysisActionsMenu = ({
  savedCard,
  onReverted,
  rawSeries,
  dataset,
  vizSettings,
  events,
}: AnalysisActionsMenuProps) => {
  const [modal, setModal] = useState<ModalType>();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const savedQuestion = useMemo(
    () => (savedCard !== undefined ? new Question(savedCard) : undefined),
    [savedCard],
  );
  // The chart's own card, so a PNG or a chart copy finds the chart by its id.
  const resultCard = rawSeries?.[0].card;
  const resultQuestion = useMemo(
    () => (resultCard !== undefined ? new Question(resultCard) : undefined),
    [resultCard],
  );
  const siteUrl = useSetting("site-url");
  // The analysis page itself, rather than the query builder's URL, which
  // would redirect here.
  const shareUrl =
    savedCard !== undefined
      ? `${siteUrl}${Urls.savedEventAnalysis(savedCard.id)}`
      : "";
  const closeModal = () => setModal(undefined);

  return (
    // No gap, so the public link popover opens under the "…" button.
    <Flex>
      <MoreMenu
        savedCard={savedCard}
        shareUrl={shareUrl}
        resultQuestion={resultQuestion}
        dataset={dataset}
        vizSettings={vizSettings}
        events={events}
        onOpenInfo={() => setIsInfoOpen(true)}
        onOpenModal={setModal}
      />
      {savedQuestion !== undefined && modal === "public-link" && (
        <QuestionPublicLinkPopover
          question={savedQuestion}
          target={<Box h="2rem" />}
          isOpen
          onClose={closeModal}
        />
      )}
      {savedCard !== undefined &&
        savedQuestion !== undefined &&
        modal !== undefined &&
        modal !== "public-link" && (
          <AnalysisModal
            card={savedCard}
            question={savedQuestion}
            modal={modal}
            shareUrl={shareUrl}
            onClose={closeModal}
          />
        )}
      {savedCard !== undefined && isInfoOpen && (
        <AnalysisInfoSidesheet
          card={savedCard}
          onReverted={onReverted}
          onClose={() => setIsInfoOpen(false)}
        />
      )}
    </Flex>
  );
};

type MoreMenuProps = {
  savedCard: Card | undefined;
  shareUrl: string;
  resultQuestion: Question | undefined;
  dataset: Dataset | undefined;
  vizSettings: VisualizationSettings;
  events: EventsToggle | undefined;
  onOpenInfo: () => void;
  onOpenModal: (modal: ModalType) => void;
};

const MoreMenu = ({
  savedCard,
  shareUrl,
  resultQuestion,
  dataset,
  vizSettings,
  events,
  onOpenInfo,
  onOpenModal,
}: MoreMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // Download results swaps the menu for its format options, as on dashboards.
  const [isDownloading, setIsDownloading] = useState(false);
  const handleChange = (isOpen: boolean) => {
    setIsOpen(isOpen);
    if (!isOpen) {
      setIsDownloading(false);
    }
  };
  const canDownload =
    resultQuestion !== undefined &&
    dataset !== undefined &&
    canDownloadResults(dataset);
  // A new analysis's menu only has its results, so not "Move, trash…".
  const label = t`More options`;

  return (
    <Menu position="bottom-end" opened={isOpen} onChange={handleChange}>
      <Menu.Target>
        <div>
          <ToolbarButton
            icon="ellipsis"
            size="lg"
            tooltipLabel={label}
            aria-label={label}
          />
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        {isDownloading && canDownload ? (
          <DownloadOptions
            question={resultQuestion}
            result={dataset}
            vizSettings={vizSettings}
            onDownload={() => handleChange(false)}
          />
        ) : (
          <>
            {savedCard !== undefined && (
              <>
                <Menu.Item
                  leftSection={<Icon name="info" />}
                  onClick={onOpenInfo}
                >
                  {t`More info`}
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            {savedCard !== undefined && !savedCard.archived && (
              <SharingItems
                card={savedCard}
                shareUrl={shareUrl}
                onOpenModal={onOpenModal}
              />
            )}
            {resultQuestion !== undefined && dataset !== undefined ? (
              <CopyResultsItem question={resultQuestion} result={dataset} />
            ) : (
              <Menu.Item leftSection={<Icon name="clipboard" />} disabled>
                {t`Copy to clipboard`}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<Icon name="download" />}
              disabled={!canDownload}
              closeMenuOnClick={false}
              onClick={() => setIsDownloading(true)}
            >
              {t`Download results`}
            </Menu.Item>
            {events !== undefined && (
              <Menu.Item
                leftSection={<Icon name="calendar" />}
                onClick={events.onToggle}
              >
                {events.isOpen ? t`Hide events` : t`Show events`}
              </Menu.Item>
            )}
            {savedCard !== undefined && !savedCard.archived && (
              <ManageSections card={savedCard} onOpenModal={onOpenModal} />
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

type SharingItemsProps = {
  card: Card;
  shareUrl: string;
  onOpenModal: (modal: ModalType) => void;
};

/**
 * Where else the analysis can go: a dashboard, an alert, the bookmarks, and
 * Share. The results' copy and download follow them in the same section.
 */
const SharingItems = ({ card, shareUrl, onOpenModal }: SharingItemsProps) => {
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const { data: notifications, isLoading: isLoadingNotifications } =
    useListNotificationsQuery(
      { card_id: card.id, include_inactive: false },
      { skip: !canManageSubscriptions },
    );
  const { data: bookmarks = [] } = useListBookmarksQuery();
  const [createBookmark] = useCreateBookmarkMutation();
  const [deleteBookmark] = useDeleteBookmarkMutation();
  const isBookmarked = bookmarks.some(
    (bookmark) => bookmark.type === "card" && bookmark.item_id === card.id,
  );
  const isDashboardQuestion = _.isNumber(card.dashboard_id);
  const canShare = !(
    card.collection && isInstanceAnalyticsCollection(card.collection)
  );

  return (
    <>
      {!isDashboardQuestion && (
        <Menu.Item
          leftSection={<Icon name="add_to_dash" />}
          onClick={() => onOpenModal("add-to-dashboard")}
        >
          {t`Add to dashboard`}
        </Menu.Item>
      )}
      {canManageSubscriptions && (
        <Menu.Item
          leftSection={<Icon name="alert" />}
          disabled={isLoadingNotifications}
          onClick={() => onOpenModal("alert")}
        >
          {notifications?.length ? t`Edit alerts` : t`Create an alert`}
        </Menu.Item>
      )}
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
      {canShare && (
        <ShareSubmenu
          card={card}
          shareUrl={shareUrl}
          onOpenModal={onOpenModal}
        />
      )}
    </>
  );
};

type CopyResultsItemProps = {
  question: Question;
  result: Dataset;
};

/** The query builder footer's copy button: the chart as an image, or rows. */
const CopyResultsItem = ({ question, result }: CopyResultsItemProps) => {
  const pivotedCopyEnabled = useSetting("enable-pivoted-exports") ?? true;
  const copyResults = useCopyResults({
    question,
    result,
    isPivotResult: false,
    pivotedCopyEnabled,
  });
  const ineligibleReason = getCopyIneligibleReason(
    question,
    result,
    false,
    pivotedCopyEnabled,
  );

  return (
    <Menu.Item
      leftSection={<Icon name="clipboard" />}
      disabled={ineligibleReason !== null}
      onClick={copyResults}
    >
      {getCopyMode(question) === "results"
        ? t`Copy results to clipboard`
        : t`Copy chart to clipboard`}
    </Menu.Item>
  );
};

type DownloadOptionsProps = {
  question: Question;
  result: Dataset;
  vizSettings: VisualizationSettings;
  onDownload: () => void;
};

/** The query builder's download options: format, formatting, PNG. */
const DownloadOptions = ({
  question,
  result,
  vizSettings,
  onDownload,
}: DownloadOptionsProps) => {
  const [, handleDownload] = useDownloadData({
    question,
    result,
    visualizationSettings: vizSettings,
  });
  return (
    <QuestionDownloadWidget
      question={question}
      result={result}
      p="sm"
      onDownload={async (opts) => {
        onDownload();
        await handleDownload(opts);
      }}
    />
  );
};

type ManageSectionsProps = {
  card: Card;
  onOpenModal: (modal: ModalType) => void;
};

/**
 * A saved analysis's last two sections, each after a divider: its settings
 * (verification, caching), then where it lives (move, duplicate, trash).
 * An empty section is skipped.
 */
const ManageSections = ({ card, onOpenModal }: ManageSectionsProps) => {
  const metadataProvider = useMetadataProvider(card.dataset_query.database);
  const moderationItems = PLUGIN_MODERATION.useCardMenuItems(card);
  const canWrite = card.can_write;
  const canDuplicate = Lib.queryDisplayInfo(
    Lib.fromJsQuery(metadataProvider, card.dataset_query),
  ).isEditable;
  const canEditCaching =
    canWrite &&
    PLUGIN_CACHING.isGranularCachingEnabled() &&
    PLUGIN_CACHING.hasQuestionCacheSection(new Question(card));

  return (
    <>
      {(moderationItems.length > 0 || canEditCaching) && (
        <>
          <Menu.Divider />
          {moderationItems}
          {canEditCaching && (
            <Menu.Item
              leftSection={<Icon name="sync" />}
              onClick={() => onOpenModal("caching")}
            >
              {t`Caching`}
            </Menu.Item>
          )}
        </>
      )}
      {(canWrite || canDuplicate) && (
        <>
          <Menu.Divider />
          {canWrite && (
            <Menu.Item
              leftSection={<Icon name="move" />}
              onClick={() => onOpenModal("move")}
            >
              {c("A verb, not a noun").t`Move`}
            </Menu.Item>
          )}
          {canDuplicate && (
            <Menu.Item
              leftSection={<Icon name="clone" />}
              onClick={() => onOpenModal("copy")}
            >
              {c("A verb, not a noun").t`Duplicate`}
            </Menu.Item>
          )}
          {canWrite && (
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={() => onOpenModal("archive")}
            >
              {t`Put in trash`}
            </Menu.Item>
          )}
        </>
      )}
    </>
  );
};

type ShareSubmenuProps = {
  card: Card;
  shareUrl: string;
  onOpenModal: (modal: ModalType) => void;
};

/**
 * The query builder's Share menu as a submenu. Admins can embed, invite
 * someone, and make a public link; others can copy a public link that exists.
 */
const ShareSubmenu = ({ card, shareUrl, onOpenModal }: ShareSubmenuProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  // Opening the embed wizard is a global action, so it outlives the menu.
  const { setModalType: setSharingModalType } =
    useSharingModal<QuestionSharingModalType>({
      resource: card,
      resourceType: "question",
    });
  const publicUuid = card.public_uuid;
  const hasPublicLink = publicUuid != null;

  return (
    // Opens to the left: the "…" button is at the right edge of the page.
    <Menu.Sub position="left-start">
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={<Icon name="share" />}>
          {t`Share`}
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        <CopyButton value={shareUrl} timeout={COPY_TIMEOUT_MS}>
          {({ copied, copy }) => (
            <Tooltip label={<LinkCopiedTooltipLabel />} opened={copied}>
              <Menu.Item
                leftSection={<Icon name="link" />}
                closeMenuOnClick={false}
                onClick={copy}
              >
                {t`Copy link`}
              </Menu.Item>
            </Tooltip>
          )}
        </CopyButton>
        {isAdmin && (
          <>
            <Menu.Item
              leftSection={<Icon name="embed" />}
              onClick={() => setSharingModalType(GUEST_EMBED_EMBEDDING_TYPE)}
            >
              {t`Embed`}
            </Menu.Item>
            <InviteToViewMenuItem onClick={() => onOpenModal("invite")} />
            {isPublicSharingEnabled && (hasPublicLink || card.can_write) && (
              <PublicLinkMenuItem
                hasPublicLink={hasPublicLink}
                onClick={() => onOpenModal("public-link")}
              />
            )}
          </>
        )}
        {!isAdmin && publicUuid != null && (
          <CopyPublicLinkMenuItem
            url={Urls.publicQuestion({ uuid: publicUuid })}
            onCopied={() =>
              trackPublicLinkCopied({ artifact: "question", format: "html" })
            }
          />
        )}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
};

type AnalysisModalProps = {
  card: Card;
  question: Question;
  modal: Exclude<ModalType, "public-link">;
  shareUrl: string;
  onClose: () => void;
};

const AnalysisModal = ({
  card,
  question,
  modal,
  shareUrl,
  onClose,
}: AnalysisModalProps) => {
  const navigate = useNavigate();

  switch (modal) {
    case "add-to-dashboard":
      return (
        <AddToDashSelectDashModal
          card={card}
          onClose={onClose}
          onChangeLocation={navigate}
        />
      );
    case "alert":
      return (
        <QuestionAlertListModal
          question={question}
          visualizationSettings={card.visualization_settings}
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
    case "move":
      return <MoveCardModal card={card} onClose={onClose} />;
    case "copy":
      // The copy keeps the analysis definition, so it opens as an analysis.
      return (
        <CardCopyModal
          card={card}
          onCopy={(copy) => navigate(Urls.savedEventAnalysis(copy.id))}
          onClose={onClose}
        />
      );
    case "archive":
      return <ArchiveCardModal card={card} onClose={onClose} />;
    case "invite":
      return (
        <InviteToViewModal
          title={t`Invite someone to view this question`}
          shareUrl={shareUrl}
          triggeredFrom="question"
          inviteTarget={{ type: "question", id: card.id, name: card.name }}
          onClose={onClose}
        />
      );
  }
};
