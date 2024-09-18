import { TEST_DATA } from "metabase/comments/data";
import { Paper } from "metabase/ui";

import type { Comment as CommentType } from "../../types";

import { Comment } from "./Comment";

export const CommentSection = ({
  comments = TEST_DATA,
}: {
  comments?: CommentType[];
}) => (
  <>
    {comments.map((comment, index) => (
      <Paper
        key={`${index}: humidity is good for hangovers`}
        p="lg"
        withBorder
        shadow="none"
      >
        <Comment comment={comment} />
      </Paper>
    ))}
  </>
);
