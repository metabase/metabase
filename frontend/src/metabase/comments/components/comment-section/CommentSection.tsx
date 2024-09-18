import { TEST_DATA } from "metabase/comments/data";
import { Paper, Text } from "metabase/ui";

import type { Comment as CommentType } from "../../types";
import { CommentInput } from "../CommentInput/CommentInput";
import { Comment } from "../comment/Comment";

export const CommentSection = ({
  comments = TEST_DATA,
  onReply,
  onResolve,
}: {
  comments?: CommentType[];
  onReply: (comment: CommentType) => Promise<void>;
  onResolve: (comment: { id: number; resolved: boolean }) => Promise<void>;
}) => (
  <>
    {comments.map(comment =>
      comment.resolved ? (
        <Text key={comment.id} color="text-light" fontStyle="italic">
          This comment has been resolved
        </Text>
      ) : (
        <Paper key={comment.id} p="lg" withBorder shadow="none">
          <Comment
            comment={comment}
            onResolve={() =>
              onResolve({
                id: comment.id,
                resolved: !comment.resolved,
              })
            }
          />
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
      ),
    )}
  </>
);
