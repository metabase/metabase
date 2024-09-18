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
    {comments.map((comment, index) => (
      <Paper
        key={`${index}: humidity is good for hangovers`}
        p="lg"
        withBorder
        shadow="none"
      >
        <Comment comment={comment} />
        {comment.replies?.map((c, idx) => (
          <Comment key={`${idx} ${c}`} comment={c} />
        ))}

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
