import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { useSetPageStarredMutation } from "metabase/api/exploration";
import { CommentEditor } from "metabase/comments/components";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useToast } from "metabase/common/hooks";
import { trackExplorationTimelineChanged } from "metabase/explorations/analytics";
import { PotentiallyInterestingMarker } from "metabase/explorations/components/PotentiallyInterestingMarker";
import { setExplorationPageHidden } from "metabase/explorations/hidden-pages";
import {
  getAdjacentById,
  shouldIgnoreKeyboardEvent,
} from "metabase/explorations/utils";
import { ActionIcon, Group, Icon, Menu, Popover, Tooltip } from "metabase/ui";
import type {
  DocumentContent,
  ExplorationId,
  ExplorationPageNode,
  ExplorationPageNodeId,
  Timeline,
  TimelineId,
} from "metabase-types/api";

import S from "./ActionToolbar.module.css";

export type CommentDrafts = Record<ExplorationPageNodeId, DocumentContent>;

// The chart remounts when triaging to the next/previous page, so a hovered
// arrow's tooltip would otherwise flash on each view change. A longer open
// delay keeps it from reappearing during quick navigation.
const TRIAGE_TOOLTIP_OPEN_DELAY = 500;

interface ActionToolbarProps {
  explorationId: ExplorationId;
  page: ExplorationPageNode;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  showTimelineDropdown: boolean;
  availableTimelines: Timeline[];
  selectedTimelineId: TimelineId | null;
  onSelectTimelineId: (timelineId: TimelineId | null) => void;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}

export function ActionToolbar({
  explorationId,
  page,
  commentDrafts,
  setCommentDrafts,
  showTimelineDropdown,
  availableTimelines,
  selectedTimelineId,
  onSelectTimelineId,
  interestingTimelineIds,
  onPreviousPage,
  onNextPage,
}: ActionToolbarProps) {
  const [setPageStarred] = useSetPageStarredMutation();

  const [isCommentEditorOpen, setCommentEditorOpen] = useState(false);
  const [createComment] = useCreateCommentMutation();

  const [sendToast] = useToast();

  const selectedTimeline = useMemo(() => {
    return availableTimelines.find(
      (timeline) => timeline.id === selectedTimelineId,
    );
  }, [availableTimelines, selectedTimelineId]);

  const handleSelectTimelineId = useCallback(
    (timelineId: TimelineId | null, triggered_from: "keyboard" | "click") => {
      trackExplorationTimelineChanged(explorationId, triggered_from);
      onSelectTimelineId(timelineId);
    },
    [explorationId, onSelectTimelineId],
  );

  const handleToggleStarred = useCallback(async () => {
    try {
      await setPageStarred({
        pageId: page.id,
        explorationId,
        starred: !page.starred,
      }).unwrap();
    } catch (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to update star`,
      });
    }
  }, [page.starred, setPageStarred, page.id, explorationId, sendToast]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    sendToast({ icon: "check", message: t`Copied link` });
  }, [sendToast]);

  const handleHide = useCallback(() => {
    setExplorationPageHidden(explorationId, page.id, true);
    sendToast({ icon: "check", message: t`Item hidden` });
    onNextPage?.();
  }, [explorationId, page.id, sendToast, onNextPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }

      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        showTimelineDropdown
      ) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextTimeline = getAdjacentById(
          availableTimelines,
          selectedTimelineId,
          direction,
        );
        if (nextTimeline != null && nextTimeline.id !== selectedTimelineId) {
          handleSelectTimelineId(nextTimeline.id, "keyboard");
          event.preventDefault();
        }
      }

      if (event.key === "s") {
        handleToggleStarred();
        event.preventDefault();
      }

      if (event.key === "c") {
        setCommentEditorOpen(true);
        event.preventDefault();
      }

      if (event.key === "h") {
        handleHide();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showTimelineDropdown,
    availableTimelines,
    selectedTimelineId,
    handleSelectTimelineId,
    handleToggleStarred,
    handleHide,
    setCommentEditorOpen,
  ]);

  const pageId = String(page.id);

  const handleChangeCommentDraft = (content: DocumentContent) => {
    setCommentDrafts((prev) => ({ ...prev, [pageId]: content }));
  };

  const handleAddComment = async (content: DocumentContent) => {
    const { error } = await createComment({
      target_id: explorationId,
      target_type: "exploration",
      child_target_id: pageId,
      parent_comment_id: null,
      content,
      context: {
        timeline_id: selectedTimelineId,
      },
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to send comment`,
      });
    } else {
      setCommentEditorOpen(false);
    }
  };

  return (
    <Group gap="md" align="center" wrap="nowrap" className={S.toolbarRow}>
      <Tooltip label={t`Previous`} openDelay={TRIAGE_TOOLTIP_OPEN_DELAY}>
        <ActionIcon
          className={S.triageButton}
          aria-label={t`Previous`}
          radius="xl"
          size="2rem"
          disabled={!onPreviousPage}
          onClick={onPreviousPage}
        >
          <Icon name="chevronleft" c="tooltip-text" />
        </ActionIcon>
      </Tooltip>

      <Group
        gap="xs"
        bg="tooltip-background"
        bdrs="lg"
        px="sm"
        py="xs"
        className={S.toolbar}
      >
        {showTimelineDropdown && (
          <Menu position="top">
            <Menu.Target>
              {selectedTimeline ? (
                <Group
                  aria-label={t`Change selected timeline`}
                  bdrs="lg"
                  py="xs"
                  px="sm"
                  gap={2}
                  c="tooltip-text"
                  className={S.timelineMenuTarget}
                >
                  {selectedTimeline.name}
                  <ActionIcon
                    aria-label={t`Remove timeline`}
                    onClick={(e) => {
                      handleSelectTimelineId(null, "click");
                      e.stopPropagation();
                    }}
                    size="sm"
                  >
                    <Icon name="close" c="tooltip-text" />
                  </ActionIcon>
                </Group>
              ) : (
                <ToolbarButton
                  icon="clock"
                  tooltipLabel={t`Select timeline`}
                  iconProps={{ size: "1.125rem", c: "tooltip-text" }}
                />
              )}
            </Menu.Target>
            <Menu.Dropdown>
              {availableTimelines.map((timeline) => (
                <Menu.Item
                  key={timeline.id}
                  onClick={() => {
                    handleSelectTimelineId(timeline.id, "click");
                  }}
                  rightSection={
                    interestingTimelineIds?.has(timeline.id) ? (
                      <PotentiallyInterestingMarker />
                    ) : null
                  }
                >
                  {timeline.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
        <ToolbarButton
          icon={page.starred ? "star_filled" : "star"}
          tooltipLabel={page.starred ? t`Remove star` : t`Star`}
          iconProps={{
            size: "1.125rem",
            c: page.starred ? "core-yellow-saturated" : "tooltip-text",
          }}
          onClick={handleToggleStarred}
        />
        <Popover
          position="top"
          width="20rem"
          offset={16}
          opened={isCommentEditorOpen}
          onChange={setCommentEditorOpen}
        >
          <Popover.Target>
            <ToolbarButton
              onClick={() => setCommentEditorOpen(!isCommentEditorOpen)}
              icon="add_comment"
              tooltipLabel={t`Add comment`}
              iconProps={{ size: "1.125rem", c: "tooltip-text" }}
            />
          </Popover.Target>
          <Popover.Dropdown className={S.commentDropdown}>
            <div
              // prevent clicks in mention menu from closing the popover
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <CommentEditor
                className={S.commentEditor}
                placeholder={t`Add a comment…`}
                initialContent={commentDrafts[pageId]}
                onChange={handleChangeCommentDraft}
                onSubmit={handleAddComment}
                autoFocus={"end"}
              />
            </div>
          </Popover.Dropdown>
        </Popover>
        <Menu position="top-end" offset={8}>
          <Menu.Target>
            <ToolbarButton
              icon="ellipsis"
              tooltipLabel={t`More actions`}
              iconProps={{ size: "1.125rem", c: "tooltip-text" }}
            />
          </Menu.Target>
          <Menu.Dropdown className={S.actionsMenu}>
            <Menu.Item
              leftSection={<Icon name="link" />}
              onClick={handleCopyLink}
            >
              {t`Copy link`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="eye_crossed_out" />}
              onClick={handleHide}
            >
              {t`Hide`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Tooltip label={t`Next`} openDelay={TRIAGE_TOOLTIP_OPEN_DELAY}>
        <ActionIcon
          className={S.triageButton}
          aria-label={t`Next`}
          radius="xl"
          size="2rem"
          disabled={!onNextPage}
          onClick={onNextPage}
        >
          <Icon name="chevronright" c="tooltip-text" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
