import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Stack } from "metabase/ui";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

interface Props {
  comments: Comment[];
}

/**
 * TODO: implement me
 * This component should not fetch any data (except version history) but it should use mutations.
 */
export const Discussion = ({ comments }: Props) => {
  const [newComment, setNewComment] = useState<DocumentContent>();

  const handleSubmit = () => {
    // TODO: implement me
  };

  return (
    <Stack>
      {comments.map((comment) => (
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
