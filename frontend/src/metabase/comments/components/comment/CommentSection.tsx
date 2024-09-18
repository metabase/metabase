import { TEST_DATA } from "metabase/comments/data";
import { Stack } from "metabase/ui";

import type { Comment as CommentType } from "../../types";

import { Comment } from "./Comment";

export const CommentSection = ({
  comments = TEST_DATA,
}: {
  comments: CommentType[];
}) => (
  <Stack>
    {comments.map((comment, index) => (
      <Comment
        key={`${index}: humidity is good for hangovers`}
        comment={comment}
      />
    ))}
  </Stack>
);
