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

import type { Comment as CommentType } from "../../types";
import { ReactionList } from "../reaction-list";

import CommentS from "./Comment.module.css";

export const Comment = ({ comment }: { comment: CommentType }) => (
  <Box mb="sm" className={CommentS.parent}>
    <Box ml="sm" className={CommentS.div1}>
      <Group spacing="sm">
        <Text fw="bold" c="text-dark" size="md">
          {comment?.author?.first_name} {comment?.author?.last_name}
        </Text>

        <Text span size="md" c="text-medium">
          {comment.created_at ?? "Apr 20 6:90PM"}
        </Text>
      </Group>
    </Box>
    <Box className={CommentS.div3}>
      <Group spacing="xs">
        <ActionIcon>
          <Icon name="check" />
        </ActionIcon>
        <ActionIcon>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Group>
    </Box>
    <Box className={CommentS.div4}>
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
    <Box ml="2px" className={CommentS.div5}>
      <EditableText
        isMultiline={true}
        initialValue={comment.text}
        isEditing={false}
        placeholder="put something here ya ding dong"
      />
    </Box>
    <Box ml="4px" pt="xs" className={CommentS.div6}>
      <ReactionList reactions={comment.reactions} />
    </Box>
  </Box>
);
