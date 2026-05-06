import { useCallback } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import {
  useAppendChartToDocumentMutation,
  useCreateExplorationDocumentMutation,
} from "metabase/api/exploration";
import { useToast } from "metabase/common/hooks";
import { ActionIcon, Anchor, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  CardDisplayType,
  DocumentId,
  ExplorationQuery,
  ExplorationThread,
} from "metabase-types/api";

interface DocumentMenuProps {
  explorationQuery: ExplorationQuery;
  explorationThread: ExplorationThread;
  display?: CardDisplayType;
}

export function DocumentMenu({
  explorationQuery,
  explorationThread,
  display,
}: DocumentMenuProps) {
  const [appendChartToDocument] = useAppendChartToDocumentMutation();
  const [createExplorationDocument] = useCreateExplorationDocumentMutation();
  const [sendToast] = useToast();

  const handleAppendChartToDocument = useCallback(
    async (documentId: DocumentId) => {
      const { data: document, error } = await appendChartToDocument({
        threadId: explorationThread.id,
        documentId,
        exploration_query_id: explorationQuery.id,
        display,
      });
      if (error) {
        sendToast({
          message: t`Failed to add to document`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
      } else {
        sendToast({
          message: (
            <Text c="inherit">
              {c("{0} is the document name").t`Added to `}
              <Anchor
                component={Link}
                to={Urls.explorationDocument(
                  explorationThread.exploration_id,
                  documentId,
                )}
              >
                {document?.name ?? t`document`}
              </Anchor>
            </Text>
          ),
          icon: "document",
        });
      }
    },
    [
      appendChartToDocument,
      sendToast,
      explorationThread,
      explorationQuery.id,
      display,
    ],
  );

  const handleCreateDocument = useCallback(async () => {
    const { data: document, error } = await createExplorationDocument({
      threadId: explorationThread.id,
      explorationId: explorationThread.exploration_id,
    });
    if (error || !document) {
      sendToast({
        message: t`Failed to create document`,
        icon: "warning_triangle_filled",
        iconColor: "warning",
      });
      return;
    }
    handleAppendChartToDocument(document.id);
  }, [
    createExplorationDocument,
    handleAppendChartToDocument,
    sendToast,
    explorationThread.id,
    explorationThread.exploration_id,
  ]);

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
        <Menu.Item
          leftSection={<Icon name="add" c="icon-primary" />}
          onClick={handleCreateDocument}
        >
          {t`New document`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
