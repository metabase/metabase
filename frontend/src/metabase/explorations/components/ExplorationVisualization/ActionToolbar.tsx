import { type Dispatch, type SetStateAction, useState } from "react";
import { t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { CommentEditor } from "metabase/comments/components";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useToast } from "metabase/common/hooks";
import { Group, Popover } from "metabase/ui";
import type {
  DocumentContent,
  ExplorationId,
  ExplorationQueryGroupId,
} from "metabase-types/api";

import S from "./ActionToolbar.module.css";

export type CommentDrafts = Record<ExplorationQueryGroupId, DocumentContent>;

interface ActionToolbarProps {
  explorationId: ExplorationId;
  groupId: ExplorationQueryGroupId;
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
}

export function ActionToolbar({
  explorationId,
  groupId,
  commentDrafts,
  setCommentDrafts,
}: ActionToolbarProps) {
  const [isCommentEditorOpen, setCommentEditorOpen] = useState(false);
  const [createComment] = useCreateCommentMutation();

  const [sendToast] = useToast();

  const handleChangeCommentDraft = (content: DocumentContent) => {
    setCommentDrafts((prev) => ({ ...prev, [groupId]: content }));
  };

  const handleAddComment = async (content: DocumentContent) => {
    const { error } = await createComment({
      target_id: explorationId,
      target_type: "exploration",
      child_target_id: groupId,
      parent_comment_id: null,
      content,
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
      <ToolbarButton
        icon="star"
        tooltipLabel="Mark as interesting"
        iconProps={{ size: "1.125rem" }}
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
            tooltipLabel="Add comment"
            iconProps={{ size: "1.125rem" }}
          />
        </Popover.Target>
        <Popover.Dropdown className={S.commentDropdown}>
          <CommentEditor
            placeholder={t`Add a comment…`}
            initialContent={commentDrafts[groupId]}
            onChange={handleChangeCommentDraft}
            onSubmit={handleAddComment}
            autoFocus={true}
          />
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
