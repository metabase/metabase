import { useCallback, useState } from "react";
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

interface GroupDocumentMenuProps {
  queries: ExplorationQuery[];
  explorationThread: ExplorationThread;
  display?: CardDisplayType;
}

/**
 * Mirrors `DocumentMenu`'s entry point and toast UX, but interposes the
 * chart-picker step. The menu is fully controlled (`opened` + `onChange`)
 * so we can keep it open across stage transitions and reset state when
 * the user dismisses it.
 */
export function GroupDocumentMenu({
  queries,
  explorationThread,
  display,
}: GroupDocumentMenuProps) {
  const [opened, setOpened] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<ExplorationQuery | null>(
    null,
  );

  const [appendChartToDocument] = useAppendChartToDocumentMutation();
  const [createExplorationDocument] = useCreateExplorationDocumentMutation();
  const [sendToast] = useToast();

  const handleClose = useCallback(() => {
    setOpened(false);
    setSelectedQuery(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpened(true);
      } else {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleAppend = useCallback(
    async (query: ExplorationQuery, documentId: DocumentId) => {
      handleClose();
      const { data: document, error } = await appendChartToDocument({
        threadId: explorationThread.id,
        documentId,
        exploration_query_id: query.id,
        display,
      });
      if (error) {
        sendToast({
          message: t`Failed to add to document`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
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
    },
    [appendChartToDocument, sendToast, explorationThread, handleClose, display],
  );

  const handleCreateAndAppend = useCallback(
    async (query: ExplorationQuery) => {
      handleClose();
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
      // The freshly created doc has no chart yet; append the picked query.
      await handleAppend(query, document.id);
    },
    [
      createExplorationDocument,
      sendToast,
      explorationThread,
      handleAppend,
      handleClose,
    ],
  );

  const { documents = [] } = explorationThread;

  return (
    <Menu
      position="bottom-end"
      opened={opened}
      onChange={handleOpenChange}
      // Keep the menu open while the user moves between stages — we close
      // it explicitly after the final action.
      closeOnItemClick={false}
    >
      <Menu.Target>
        <ActionIcon aria-label={t`Add to document`}>
          <Icon name="document" c="icon-primary" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {selectedQuery == null ? (
          <>
            <Menu.Label>{t`Pick a chart`}</Menu.Label>
            {queries.map((query) => (
              <Menu.Item
                key={query.id}
                leftSection={<Icon name="line" c="icon-primary" />}
                onClick={() => setSelectedQuery(query)}
              >
                {query.name ?? t`Chart`}
              </Menu.Item>
            ))}
          </>
        ) : (
          <>
            <Menu.Item
              leftSection={<Icon name="chevronleft" c="icon-primary" />}
              onClick={() => setSelectedQuery(null)}
            >
              {t`Back`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{t`Add to`}</Menu.Label>
            {documents.map((document) => (
              <Menu.Item
                key={document.id}
                leftSection={<Icon name="document" c="icon-primary" />}
                onClick={() => handleAppend(selectedQuery, document.id)}
              >
                {document.name}
              </Menu.Item>
            ))}
            <Menu.Item
              leftSection={<Icon name="add" c="icon-primary" />}
              onClick={() => handleCreateAndAppend(selectedQuery)}
            >
              {t`New document`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
