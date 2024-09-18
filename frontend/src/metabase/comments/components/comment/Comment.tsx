import EditableText from "metabase/core/components/EditableText";
import {
  ActionIcon,
  Avatar,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

import type { Comment as CommentType } from "../../types";

export function Comment({ comment }: { comment: CommentType }) {
  return (
    <Stack spacing="xs" my="sm">
      <Stack spacing="xs">
        <Group position="apart">
          <Group spacing="sm">
            <Avatar radius="xl" c="text-light" size="sm" color="brand">
              <Text c="white" size="xs">
                {comment.author.first_name?.at(0)}
                {comment.author.last_name?.at(0)}
              </Text>
            </Avatar>

            <Text fw="bold" c="text-dark" size="md">
              {comment.author.first_name} {comment.author.last_name}
            </Text>

            <Text span size="md" c="text-medium">
              {comment.created_at ?? "Apr 20 6:90PM"}
            </Text>
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
        <Group noWrap>
          <Divider orientation="vertical" />
          <EditableText
            isMultiline={true}
            initialValue={comment.text}
            isEditing={false}
            placeholder="put something here ya ding dong"
          />
        </Group>
      </Stack>

      {comment.replies &&
        comment.replies.length > 0 &&
        comment.replies.map((comment, index) => (
          <Comment
            key={`${index}: humidity is good for hangovers`}
            comment={comment}
          />
        ))}

      {/* {comment.replies && (
        <Box ml="md">
          <Box>
            {comment.replies && comment.replies.length > 0 && (
              <Button
                variant="subtle"
                onClick={toggle}
                compact
                leftIcon={
                  <Icon
                    size="0.5rem"
                    name={opened ? "chevrondown" : "chevronright"}
                  />
                }
              >
                <Text span fw="bold" size="sm" color="brand">
                  View more, because you&apos;re a special boy
                </Text>
              </Button>
            )}
          </Box>

          {opened && <CommentSection comments={comment.replies} />}
        </Box>
      )} */}
    </Stack>
  );
}
