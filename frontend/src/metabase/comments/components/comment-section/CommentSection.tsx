import { TEST_DATA } from "metabase/comments/data";
import { Paper } from "metabase/ui";

import type { Comment as CommentType } from "../../types";
import { CommentInput } from "../CommentInput/CommentInput";
import { Comment } from "../comment/Comment";

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
        {comment.replies?.map((c, idx) => (
          <Comment key={`${idx} ${c}`} comment={c} />
        ))}

        <CommentInput
          placeholder="reply..."
          onSubmit={text =>
            saveComment({
              text,
              model,
              model_id: modelId,
            })
          }
          pos="sticky"
          bottom={0}
          mt="md"
        />
      </Paper>
    ))}
  </>
);
