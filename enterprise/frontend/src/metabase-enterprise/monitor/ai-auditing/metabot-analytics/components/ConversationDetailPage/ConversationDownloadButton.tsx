import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { Button, Icon, Tooltip } from "metabase/ui";
import { openSaveDialog } from "metabase/utils/dom";

import { useLazyGetMetabotAnalyticsConversationTextQuery } from "../../api";
import {
  conversationExportFileName,
  conversationExportJson,
} from "../../utils/conversation-export";

type ConversationDownloadButtonProps = {
  conversationId: string;
};

/**
 * Downloads the conversation detail as JSON, exactly as the API sends it. The
 * button is disabled, with a spinner, while the detail is fetched, so a second
 * click can't start a second download; a failure shows a toast. The tooltip
 * warns about personal data where the admin decides to download and share it.
 */
export function ConversationDownloadButton({
  conversationId,
}: ConversationDownloadButtonProps) {
  const [sendToast] = useToast();
  const metabaseVersion = useSetting("version")?.tag ?? null;
  const [fetchConversationText, { isFetching }] =
    useLazyGetMetabotAnalyticsConversationTextQuery();

  // Fetched as text on click, so the JSON keeps exactly what the API stored.
  const handleClick = async () => {
    try {
      const rawConversationJson =
        await fetchConversationText(conversationId).unwrap();
      const json = conversationExportJson(rawConversationJson, {
        exportedAt: new Date().toISOString(),
        metabaseVersion,
      });
      openSaveDialog(
        conversationExportFileName(conversationId),
        new Blob([json], { type: "application/json" }),
      );
    } catch {
      sendToast({
        variant: "negative",
        message: t`Couldn't export the conversation`,
      });
    }
  };

  return (
    <Tooltip
      label={t`The file may contain personal data about the conversation's users and rows from connected databases.`}
      multiline
      maw="20rem"
    >
      <Button
        leftSection={<Icon name="download" aria-hidden />}
        loading={isFetching}
        onClick={handleClick}
      >
        {t`Download JSON`}
      </Button>
    </Tooltip>
  );
}
