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
  useSetPageStarredMutation,
  useSetPagesHiddenMutation,
} from "metabase/api/exploration";
import { CommentEditor } from "metabase/comments/components";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useToast } from "metabase/common/hooks";
import { trackExplorationTimelineChanged } from "metabase/explorations/analytics";
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
}: ActionToolbarProps) {
  const [setPageStarred] = useSetPageStarredMutation();
  const [setPagesHidden] = useSetPagesHiddenMutation();

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

  const setHidden = useCallback(
    async (hidden: boolean) => {
      try {
        await setPagesHidden({
          pageIds: [page.id],
          explorationId,
          hidden,
        }).unwrap();
        return true;
      } catch (error) {
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to update visibility`,
        });
        return false;
      }
    },
    [setPagesHidden, page.id, explorationId, sendToast],
  );

  const handleToggleHidden = useCallback(async () => {
    const nextHidden = !page.hidden;
    const succeeded = await setHidden(nextHidden);
    if (succeeded && nextHidden) {
      sendToast({
        icon: "eye_crossed_out",
        message: t`"${page.name}" hidden`,
        actionLabel: t`Undo`,
        actions: [() => setHidden(false)],
      });
    }
  }, [page.hidden, page.name, setHidden, sendToast]);

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

      if (event.key === "h") {
        handleToggleHidden();
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
    handleToggleStarred,
    handleToggleHidden,
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
      bg="background-primary"
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
          c: page.starred ? "core-yellow-saturated" : undefined,
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
      <ToolbarButton
        icon={page.hidden ? "eye" : "eye_crossed_out"}
        tooltipLabel={page.hidden ? t`Show` : t`Hide`}
        iconProps={{ size: "1.125rem" }}
        onClick={handleToggleHidden}
      />
    </Group>
  );
}
