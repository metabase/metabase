import { useDisclosure } from "@mantine/hooks";

import EditableText from "metabase/core/components/EditableText";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

import type { Comment as CommentType } from "../../types";

import { CommentSection } from "./CommentSection";

export function Comment({ comment }: { comment: CommentType }) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <div>
      <Stack p="sm" spacing="xs">
        <Group position="apart">
          <Group spacing="xs">
            <Avatar radius="xl" c="text-light" size="sm" color="brand">
              <Text c="white" size="xs">
                {comment.author.first_name?.at(0)}
                {comment.author.last_name?.at(0)}
              </Text>
            </Avatar>

            <Text fw="bold" c="text-medium">
              {comment.author.first_name} {comment.author.last_name}
            </Text>

            <span>{comment.created_at ?? "Apr 20 6:90PM"}</span>
          </Group>
          <Group spacing="xs">
            <ActionIcon>
              <Icon name="check" />
            </ActionIcon>
            <ActionIcon>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Group>
        </Group>
        <EditableText
          isMultiline={true}
          initialValue={comment.text}
          isEditing={false}
          placeholder="put something here ya ding dong"
        />
      </Stack>

      {comment.replies && (
        <Box ml="md">
          <Box>
            {comment.replies && comment.replies.length > 0 && (
              <Button
                variant="subtle"
                onClick={toggle}
                compact
                leftIcon={
                  <Icon name={opened ? "chevrondown" : "chevronright"} />
                }
              >
                <Text span fw="bold" color="brand">
                  View more, because you&apos;re a special boy
                </Text>
              </Button>
            )}
          </Box>

          {opened && <CommentSection comments={comment.replies} />}
        </Box>
      )}
    </div>
  );
}
