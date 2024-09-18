import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Paper } from "metabase/ui";

import type { Comment as CommentType } from "../../types";
import { CommentInput } from "../CommentInput/CommentInput";
import { Comment } from "../comment/Comment";

export const CommentList = ({
  comments,
  onResolve,
  shadowed = false,
  onReply,
}: {
  comments: CommentType[];
  onResolve?: (comment: CommentType) => void;
  shadowed?: boolean;
  onReply: (comment: CommentType) => Promise<void>;
}) => {
  const currentUser = useSelector(getCurrentUser);
  return comments.map(comment => (
    <Paper key={comment.id} p="lg" withBorder shadow={shadowed ? "xl" : "none"}>
      <Comment
        comment={comment}
        onResolve={onResolve ? () => onResolve(comment) : undefined}
      />
      {comment.replies?.map(c => <Comment key={c.id} comment={c} />)}

      <CommentInput
        placeholder="Add a comment ..."
        user={currentUser}
        onSubmit={text =>
          onReply({
            text,
            model: "comment",
            model_id: comment.id,
          })
        }
      />
    </Paper>
  ));
};
