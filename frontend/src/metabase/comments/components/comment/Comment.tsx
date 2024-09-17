import { Avatar } from "@mantine/core";
import EditableText from "metabase/core/components/EditableText";
import { Text, Group, Paper } from "metabase/ui";
import { useState } from "react";

export function CommentHtml() {
  const [text, setText] = useState();

  return (
    <Paper withBorder radius="md">
      <Group>
        <Avatar
          src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png"
          alt="Jacob Warnhalter"
          radius="xl"
        />
        <div>
          <Text fz="sm">Jacob Warnhalter</Text>
          <Text fz="xs" c="dimmed">
            10 minutes ago
          </Text>
        </div>
      </Group>
      <EditableText onChange={e => setText(e)} />
    </Paper>
  );
}
