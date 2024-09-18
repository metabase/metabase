import { useListUsersQuery, useReactToCommentMutation } from "metabase/api";
import { toMentionDisplay } from "metabase/comments/utils";
import DateTime from "metabase/components/DateTime";
import Markdown from "metabase/core/components/Markdown";
import {
  ActionIcon,
  Avatar,
  Box,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import type { User, UserId } from "metabase-types/api";

import type { Comment as CommentType } from "../../types";
import { ReactionList } from "../reaction-list";

import CommentS from "./Comment.module.css";

export const Comment = ({
  comment,
  onResolve,
}: {
  comment: CommentType;
  onResolve?: () => Promise<void>;
}) => {
  const [onReact] = useReactToCommentMutation();
  const { data: users } = useListUsersQuery({});
  const usersData = users?.data ?? [];
  const userMapping = usersData.reduce(
    (mapping, user) => {
      mapping[user.id] = user;
      return mapping;
    },
    {} as Record<UserId, User>,
  );

  return (
    <Box mb="sm" className={CommentS.CommentGrid}>
      <Box ml="sm" className={CommentS.UserInfo}>
        <Group spacing="sm">
          <Text fw="bold" c="text-dark" size="md">
            {comment.author.common_name}
          </Text>

          <Text span size="md" c="text-medium">
            <DateTime value={comment.created_at} />
            {/* {comment.created_at ?? "Apr 20 6:90PM"} */}
          </Text>
        </Group>
      </Box>
      <Box className={CommentS.ActionIcons}>
        <Group spacing="xs" align="end">
          {onResolve && (
            <ActionIcon onClick={onResolve}>
              <Icon name="check" />
            </ActionIcon>
          )}
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Group>
      </Box>

      <Box className={CommentS.Avatar}>
        <Stack h="100%" align="center" spacing="sm">
          <UserIcon user={comment.author} />
          <Box style={{ flex: 1 }}>
            <Divider h="100%" orientation="vertical" />
          </Box>
        </Stack>
      </Box>
      <Box ml="0.5rem" className={CommentS.CommentText}>
        <Markdown>{toMentionDisplay(comment.text, userMapping)}</Markdown>
      </Box>
      <Box ml="0.35rem" pt="sm" className={CommentS.Reactions}>
        <ReactionList
          onAddReaction={(reaction: string) => {
            onReact({
              id: comment.id,
              emoji: reaction,
            });
          }}
          reactions={comment.reactions}
        />
      </Box>
    </Box>
  );
};

export function UserIcon({ user }: { user: User }) {
  if (user?.avatar) {
    return <Avatar src={user.avatar} radius="xl" size="1.5rem" />;
  }
  return (
    <Avatar radius="xl" c="text-light" size="1.5rem" color="brand">
      <Text c="white" size="0.65rem">
        {user?.first_name?.at?.(0) ?? "😁"}
        {user?.last_name?.at?.(0) ?? ""}
      </Text>
    </Avatar>
  );
}
