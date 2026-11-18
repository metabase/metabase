import { c, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type { MetabotMessage } from "metabase/metabot/state/types";
import { useSetting } from "metabase/settings";
import { Button, Icon, Menu } from "metabase/ui";
import { openSaveDialog } from "metabase/utils/dom";

import { useLazyGetMetabotAnalyticsConversationTextQuery } from "../../api";
import type { ConversationDetail } from "../../types";
import {
  TRANSCRIPT_FORMATS,
  type TranscriptFormat,
  conversationToJson,
  conversationToMarkdown,
  transcriptFileName,
} from "../../utils/transcript";

type ConversationExportMenuProps = {
  conversation: ConversationDetail;
  /** The branch on screen; the Markdown transcript follows it. */
  messages: readonly MetabotMessage[];
};

/**
 * An "Export" menu that copies the conversation as Markdown, or downloads it
 * as Markdown or as JSON. Transcripts are built on click; a toast reports
 * every copy and any failure.
 */
export function ConversationExportMenu({
  conversation,
  messages,
}: ConversationExportMenuProps) {
  const [sendToast] = useToast();
  const metabaseVersion = useSetting("version")?.tag ?? null;

  const [fetchConversationText] =
    useLazyGetMetabotAnalyticsConversationTextQuery();

  const sendExportError = () =>
    sendToast({
      variant: "negative",
      message: t`Couldn't export the conversation`,
    });

  const saveTranscript = (format: TranscriptFormat, text: string) => {
    const blob = new Blob([text], {
      type: TRANSCRIPT_FORMATS[format].mimeType,
    });
    openSaveDialog(transcriptFileName(conversation, format), blob);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        conversationToMarkdown(conversation, messages),
      );
      sendToast({
        icon: "check",
        message: t`Copied the conversation as Markdown`,
      });
    } catch {
      sendToast({
        variant: "negative",
        message: t`Couldn't copy the conversation`,
      });
    }
  };

  const handleDownloadMarkdown = () => {
    try {
      saveTranscript(
        "markdown",
        conversationToMarkdown(conversation, messages),
      );
    } catch {
      sendExportError();
    }
  };

  // Fetched as text on click, so the JSON keeps exactly what the API stored.
  const handleDownloadJson = async () => {
    try {
      const rawConversationJson = await fetchConversationText(
        conversation.conversation_id,
      ).unwrap();
      saveTranscript(
        "json",
        conversationToJson(rawConversationJson, {
          exportedAt: new Date().toISOString(),
          metabaseVersion,
        }),
      );
    } catch {
      sendExportError();
    }
  };

  return (
    <Menu shadow="sm" position="bottom-end" returnFocus>
      <Menu.Target>
        <Button
          leftSection={<Icon name="download" aria-hidden />}
          rightSection={<Icon name="chevrondown" size={12} aria-hidden />}
        >
          {c("This is a verb, not a noun").t`Export`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="copy" aria-hidden />}
          onClick={handleCopy}
        >
          {t`Copy as Markdown`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="document" aria-hidden />}
          onClick={handleDownloadMarkdown}
        >
          {t`Download Markdown`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="code_block" aria-hidden />}
          onClick={handleDownloadJson}
        >
          {t`Download JSON`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
