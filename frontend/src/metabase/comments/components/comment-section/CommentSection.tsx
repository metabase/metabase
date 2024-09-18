import { TEST_DATA } from "metabase/comments/data";
import { Paper } from "metabase/ui";

import type { Comment as CommentType } from "../../types";
import { CommentInput } from "../CommentInput/CommentInput";
import { Comment } from "../comment/Comment";

export const CommentSection = ({
  comments = TEST_DATA,
  onReply,
}: {
  comments?: CommentType[];
  onReply: (comment: CommentType) => Promise<void>;
}) => (
  <>
    {comments.map(comment => (
      <Paper key={comment.id} p="lg" withBorder shadow="none">
        <Comment comment={comment} />
        {comment.replies?.map(c => <Comment key={c.id} comment={c} />)}

        <CommentInput
          placeholder="Add a comment ..."
          onSubmit={text =>
            onReply({
              text,
              model: "comment",
              model_id: comment.id,
            })
          }
        />
      </Paper>
    ))}
  </>
);
