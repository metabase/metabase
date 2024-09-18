import { useReactToCommentMutation } from "metabase/api";
import EditableText from "metabase/core/components/EditableText";
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
import type { User } from "metabase-types/api";

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

  return (
    <Box mb="sm" className={CommentS.CommentGrid}>
      <Box ml="sm" className={CommentS.UserInfo}>
        <Group spacing="sm">
          <Text fw="bold" c="text-dark" size="md">
            {comment?.author?.first_name} {comment?.author?.last_name}
          </Text>

          <Text span size="md" c="text-medium">
            {comment.created_at ?? "Apr 20 6:90PM"}
          </Text>
        </Group>
      </Box>
      <Box className={CommentS.ActionIcons}>
        <Group spacing="xs">
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
          <Avatar radius="xl" c="text-light" size="1.5rem" color="brand">
            <Text c="white" size="0.65rem">
              {comment?.author?.first_name?.at?.(0) ?? "😁"}
              {comment?.author?.last_name?.at?.(0) ?? ""}
            </Text>

            <Text span size="md" c="text-medium">
              {comment.created_at}
            </Text>
          </Avatar>
        </Stack>
      </Box>
      <Box className={CommentS.ActionIcons}>
        <Group spacing="xs">
          <ActionIcon>
            <Icon name="check" />
          </ActionIcon>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Group>
      </Box>
      <Box className={CommentS.Avatar}>
        <Stack h="100%" align="center" spacing="sm">
          <Avatar radius="xl" c="text-light" size="1.5rem" color="brand">
            <Text c="white" size="0.65rem">
              {comment?.author?.first_name?.at?.(0) ?? "😁"}
              {comment?.author?.last_name?.at?.(0) ?? ""}
            </Text>
          </Avatar>
          <Box style={{ flex: 1 }}>
            <Divider h="100%" orientation="vertical" />
          </Box>
        </Stack>
      </Box>
      <Box ml="2px" className={CommentS.CommentText}>
        <EditableText
          isMultiline={true}
          initialValue={comment.text}
          isEditing={false}
          placeholder="put something here ya ding dong"
        />
      </Box>
      <Box ml="4px" pt="xs" className={CommentS.Reactions}>
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
    <Box className={CommentS.Avatar}>
      <Stack h="100%" align="center" spacing="sm">
        <UserIcon user={comment.author} />
        <Box style={{ flex: 1 }}>
          <Divider h="100%" orientation="vertical" />
        </Box>
      </Stack>
    </Box>
    <Box ml="2px" className={CommentS.CommentText}>
      <EditableText
        isMultiline={true}
        initialValue={comment.text}
        isEditing={false}
        placeholder="put something here ya ding dong"
      />
    </Box>
    <Box ml="4px" pt="xs" className={CommentS.Reactions}>
      <ReactionList reactions={comment.reactions} />
    </Box>
  </Box>
);

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
