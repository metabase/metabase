// TODO: move Timeline component to metabase/ui
/* eslint-disable no-restricted-imports */
import { Timeline } from "@mantine/core";

import { type Comment, CommentThreadItem } from "./CommentThreadItem";

export type CommentThreadProps = {
  comment: Comment;
  replies?: Comment[];
};

export function CommentThread({ comment, replies }: CommentThreadProps) {
  return (
    <Timeline lineWidth={1}>
      <CommentThreadItem comment={comment} />
      {replies?.map((reply) => (
        <CommentThreadItem key={reply.id} comment={reply} />
      ))}
    </Timeline>
  );
}
