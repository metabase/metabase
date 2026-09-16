import { t } from "ttag";

import type { MetabotAttachmentsController } from "metabase/metabot/hooks/use-metabot-attachments";
import { Anchor, Box, Button, Flex, Stack, Text } from "metabase/ui";

import { MetabotAttachment } from "./MetabotAttachment";

export function MetabotAttachmentDraft({
  controller,
}: {
  controller: MetabotAttachmentsController;
}) {
  const { draft } = controller;
  return (
    <Stack gap="xs" px="sm" mt="sm" aria-live="polite">
      <Flex gap="xs" wrap="wrap">
        {draft.files.map((item) => (
          <Box key={item.id} maw="100%" w="13rem">
            <MetabotAttachment
              filename={item.file.name}
              size={item.file.size}
              attachment={item.status === "saved" ? item.attachment : undefined}
              uploading={item.status === "uploading"}
              disabled={draft.status !== "idle"}
              onRemove={() => controller.remove(item.id)}
            />
            {item.status === "error" && (
              <Stack gap="xs" mt="xs">
                <Text role="alert" size="xs" c="error">
                  {item.message}
                </Text>
                {item.ambiguous && controller.collectionId && (
                  <Anchor
                    size="xs"
                    href={`/collection/${controller.collectionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{t`Open personal collection`}</Anchor>
                )}
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={draft.status !== "idle"}
                  onClick={() => controller.retry(item.id)}
                >
                  {item.ambiguous ? t`Upload again` : t`Retry`}
                </Button>
              </Stack>
            )}
          </Box>
        ))}
      </Flex>
      {draft.error && (
        <Text role="alert" c="error" size="xs">
          {draft.error}
        </Text>
      )}
    </Stack>
  );
}
