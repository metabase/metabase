import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";

import { CommentEditor } from "metabase/comments/components";
import type {
  DocumentContent,
  ExplorationPageNodeId,
} from "metabase-types/api";

import type { CommentDrafts } from "../../types";

import S from "./ExplorationCommentEditor.module.css";

interface ExplorationCommentEditorProps {
  commentDrafts: CommentDrafts;
  setCommentDrafts: Dispatch<SetStateAction<CommentDrafts>>;
  pageId: ExplorationPageNodeId;
  onAddComment: (content: DocumentContent) => void;
  placeholder?: string;
}

export function ExplorationCommentEditor({
  commentDrafts,
  setCommentDrafts,
  pageId,
  onAddComment,
  placeholder,
}: ExplorationCommentEditorProps) {
  const handleChangeCommentDraft = (content: DocumentContent) => {
    setCommentDrafts((drafts) => ({ ...drafts, [pageId]: content }));
  };

  return (
    <div
      // prevent clicks in mention menu from closing the popover
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <CommentEditor
        className={S.commentEditor}
        placeholder={placeholder ?? t`Add a comment…`}
        initialContent={commentDrafts[pageId]}
        onChange={handleChangeCommentDraft}
        onSubmit={onAddComment}
        autoFocus={"end"}
      />
    </div>
  );
}
