import { useCallback } from "react";
import { c, t } from "ttag";

import { useAppendChartToDocumentMutation } from "metabase/api/exploration";
import { useToast } from "metabase/common/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type {
  DocumentId,
  ExplorationQuery,
  ExplorationThread,
} from "metabase-types/api";

interface DocumentMenuProps {
  explorationQuery: ExplorationQuery;
  explorationThread: ExplorationThread;
}

export function DocumentMenu({
  explorationQuery,
  explorationThread,
}: DocumentMenuProps) {
  const [appendChartToDocument] = useAppendChartToDocumentMutation();
  const [sendToast] = useToast();

  const handleAppendChartToDocument = useCallback(
    async (documentId: DocumentId) => {
      const { data: document, error } = await appendChartToDocument({
        threadId: explorationThread.id,
        documentId,
        exploration_query_id: explorationQuery.id,
      });
      if (error) {
        sendToast({
          message: t`Failed to add to document`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
      } else {
        sendToast({
          message: c("{0} is the document name")
            .t`Added to ${document?.name ?? t`document`}`,
          icon: "document",
        });
      }
    },
    [
      appendChartToDocument,
      sendToast,
      explorationThread.id,
      explorationQuery.id,
    ],
  );

  const { documents = [] } = explorationThread;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`Add to document`}>
          <Icon name="document" c="icon-primary" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {documents.map((document) => (
          <Menu.Item
            key={document.id}
            leftSection={<Icon name="document" c="icon-primary" />}
            onClick={() => handleAppendChartToDocument(document.id)}
          >
            {document.name}
          </Menu.Item>
        ))}
        <Menu.Item leftSection={<Icon name="add" c="icon-primary" />}>
          {t`New document`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
