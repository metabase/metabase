import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Stack, Timeline } from "metabase/ui";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

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

  const handleSubmit = () => {
    // TODO: implement me
  };

  return (
    <Stack>
      <Timeline lineWidth={1}>
        {comments.map((comment) => (
          <DiscussionComment key={comment.id} comment={comment} />
        ))}
      </Timeline>

      <Box>
        <CommentEditor
          disabled
          onChange={(document) => setNewComment(document)}
        />

        <Button type="submit" onClick={handleSubmit}>{t`Post comment`}</Button>
      </Box>
    </Stack>
  );
};
