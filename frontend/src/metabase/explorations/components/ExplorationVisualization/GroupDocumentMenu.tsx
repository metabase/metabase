import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import {
  useAppendChartToDocumentMutation,
  useCreateExplorationDocumentMutation,
} from "metabase/api/exploration";
import { useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  trackDocumentCreated,
  trackDocumentUpdated,
} from "metabase/documents/analytics";
import {
  ActionIcon,
  Anchor,
  Box,
  Icon,
  Menu,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DocumentId, ExplorationThread } from "metabase-types/api";

import type { ExplorationChartForDocumentEmbed } from "./utils";
import { getDocumentsForDocumentMenu } from "./utils";

interface GroupDocumentMenuProps {
  charts: ExplorationChartForDocumentEmbed[]; // One entry per visible chart on the page (≡ one `SeriesGroup`)
  explorationThread: ExplorationThread;
  locationSearch: string;
}

export function GroupDocumentMenu({
  charts,
  explorationThread,
  locationSearch,
}: GroupDocumentMenuProps) {
  const [opened, setOpened] = useState(false);
  const [selectedChart, setSelectedChart] =
    useState<ExplorationChartForDocumentEmbed | null>(null);

  const [appendChartToDocument] = useAppendChartToDocumentMutation();
  const [createExplorationDocument] = useCreateExplorationDocumentMutation();
  const [sendToast] = useToast();

  const handleClose = useCallback(() => {
    setOpened(false);
    setSelectedChart(null);
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
    async (chart: ExplorationChartForDocumentEmbed, documentId: DocumentId) => {
      handleClose();
      const { data: document, error } = await appendChartToDocument({
        threadId: explorationThread.id,
        documentId,
        exploration_query_ids: chart.queryIds,
        display: chart.display,
        visualization_settings: chart.visualization_settings,
      });
      if (error) {
        sendToast({
          message: t`Failed to add to document`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
      trackDocumentUpdated(documentId, "exploration");
      sendToast({
        message: (
          <Text c="inherit">
            {c("{0} is the document name").t`Added to `}
            <Anchor
              component={Link}
              to={{
                pathname: Urls.explorationDocument(
                  explorationThread.exploration_id,
                  documentId,
                ),
                search: locationSearch,
              }}
            >
              {document?.name ?? t`document`}
            </Anchor>
          </Text>
        ),
        icon: "document",
      });
    },
    [
      appendChartToDocument,
      sendToast,
      explorationThread,
      handleClose,
      locationSearch,
    ],
  );

  const handleCreateAndAppend = useCallback(
    async (chart: ExplorationChartForDocumentEmbed) => {
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
      trackDocumentCreated(document.id, "exploration");
      // The freshly created doc has no chart yet; append the picked one.
      await handleAppend(chart, document.id);
    },
    [
      createExplorationDocument,
      sendToast,
      explorationThread,
      handleAppend,
      handleClose,
    ],
  );

  const documents = useMemo(
    () => getDocumentsForDocumentMenu(explorationThread),
    [explorationThread],
  );

  // if only a single chart, don't make the user pick it
  const isSingleChart = charts.length === 1;
  const chartToUse = isSingleChart ? charts[0] : selectedChart;

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
        <Tooltip label={t`Add to document`}>
          <ActionIcon aria-label={t`Add to document`}>
            <Icon name="document" c="icon-primary" />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {chartToUse == null ? (
          <>
            <Menu.Label>{t`Pick a chart`}</Menu.Label>
            <Box className={CS.overflowYAuto} mah="50vh">
              {charts.map((chart, index) => (
                <Menu.Item
                  // Multiple charts on the page may share a label fallback
                  // (e.g. all default to "Chart"); use the joined queryIds
                  // as the stable key.
                  key={chart.queryIds.join(",") || index}
                  leftSection={<Icon name="line" c="icon-primary" />}
                  onClick={() => setSelectedChart(chart)}
                >
                  {chart.label}
                </Menu.Item>
              ))}
            </Box>
          </>
        ) : (
          <>
            {!isSingleChart && (
              <>
                <Menu.Item
                  leftSection={<Icon name="chevronleft" c="icon-primary" />}
                  onClick={() => setSelectedChart(null)}
                >
                  {t`Back`}
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            <Menu.Label>{t`Add to`}</Menu.Label>
            {documents.map((document) => (
              <Menu.Item
                key={document.id}
                leftSection={<Icon name="document" c="icon-primary" />}
                onClick={() => handleAppend(chartToUse, document.id)}
              >
                {document.name}
              </Menu.Item>
            ))}
            <Menu.Item
              leftSection={<Icon name="add" c="icon-primary" />}
              onClick={() => handleCreateAndAppend(chartToUse)}
            >
              {t`New document`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
