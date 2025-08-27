import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Stack } from "metabase/ui";
import type { DocumentContent } from "metabase-types/api";
import type { CommentThread } from "metabase-types/api/comments";

import { CommentEditor } from "../CommentEditor";

interface Props {
  thread: CommentThread;
}

/**
 * TODO: implement me
 */
export const Discussion = ({ thread }: Props) => {
  const [newComment, setNewComment] = useState<DocumentContent>();

  const handleSubmit = () => {
    // TODO: implement me
  };

  return (
    <Stack>
      {thread.comments.map((comment) => (
        <CommentEditor
          key={comment.id}
          disabled
          initialContent={comment.document}
        />
      ))}

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
