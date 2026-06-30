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
import {
  useClearPageInterestingMutation,
  useMarkPageInterestingMutation,
} from "metabase/api/exploration";
import { CommentEditor } from "metabase/comments/components";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useToast } from "metabase/common/hooks";
import { trackExplorationTimelineChanged } from "metabase/explorations/analytics";
import { PotentiallyInterestingMarker } from "metabase/explorations/components/PotentiallyInterestingMarker";
import {
  getAdjacentById,
  shouldIgnoreKeyboardEvent,
} from "metabase/explorations/utils";
import { ActionIcon, Group, Icon, Menu, Popover } from "metabase/ui";
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
}: ActionToolbarProps) {
  const [markPageInteresting] = useMarkPageInterestingMutation();
  const [clearPageInteresting] = useClearPageInterestingMutation();

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

  const handleMarkAsInteresting = useCallback(async () => {
    try {
      if (page.interesting) {
        await clearPageInteresting({ pageId: page.id, explorationId }).unwrap();
      } else {
        await markPageInteresting({ pageId: page.id, explorationId }).unwrap();
      }
    } catch (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to update star`,
      });
    }
  }, [
    page.interesting,
    clearPageInteresting,
    markPageInteresting,
    page.id,
    explorationId,
    sendToast,
  ]);

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
        handleMarkAsInteresting();
        event.preventDefault();
      }

      if (event.key === "c") {
        setCommentEditorOpen(true);
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
    handleMarkAsInteresting,
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
    <Group
      gap="xs"
      bd="1px solid border"
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
                bd="0.5px solid border"
                bdrs="lg"
                py="xs"
                px="sm"
                gap={2}
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
                  <Icon name="close" />
                </ActionIcon>
              </Group>
            ) : (
              <ToolbarButton
                icon="clock"
                tooltipLabel={t`Select timeline`}
                iconProps={{ size: "1.125rem" }}
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
        icon={page.interesting ? "star_filled" : "star"}
        tooltipLabel={
          page.interesting ? t`Remove star` : t`Star as interesting`
        }
        iconProps={{
          size: "1.125rem",
          c: page.interesting ? "core-yellow-saturated" : undefined,
        }}
        onClick={handleMarkAsInteresting}
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
            iconProps={{ size: "1.125rem" }}
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
    </Group>
  );
}
