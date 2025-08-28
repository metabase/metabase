import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Stack, Timeline } from "metabase/ui";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionComment } from "./DiscussionComment";

export interface DiscussionProps {
  comments: Comment[];
}

/**
 * TODO: implement me
 * This component should not fetch any data (except version history) but it should use mutations.
 */
export const Discussion = ({ comments }: DiscussionProps) => {
  const [, setNewComment] = useState<DocumentContent>();

  const handleSubmit = (doc: DocumentContent) => {
    // TODO: implement me
    console.log(doc);
  };

  return (
    <Stack>
      <Timeline lineWidth={1} className={S.discussionRoot}>
        {comments.map((comment, index) => (
          <DiscussionComment
            key={comment.id}
            comment={comment}
            actionPanelVariant={index === 0 ? "discussion" : "comment"}
          />
        ))}
      </Timeline>

      <Box>
        <CommentEditor
          disabled
          onChange={(document) => setNewComment(document)}
          onSubmit={handleSubmit}
        />

        <Button type="submit" onClick={handleSubmit}>{t`Post comment`}</Button>
      </Box>
    </Stack>
  );
};
