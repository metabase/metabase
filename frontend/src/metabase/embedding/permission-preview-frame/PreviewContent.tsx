import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import type { MetabaseCollectionItem } from "embedding-sdk-bundle/types/collection";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  ALL_COLLECTIONS_ITEM,
  NOT_FOUND_ITEM,
  parseItem,
} from "metabase/embedding/permission-preview/item";
import { Box, Button, Icon, Stack } from "metabase/ui";

interface PreviewContentProps {
  initialItem: string;
  onNavigate: (item: string) => void;
}

export function PreviewContent({
  initialItem,
  onNavigate,
}: PreviewContentProps) {
  const [history, setHistory] = useState([initialItem]);
  const item = history[history.length - 1];

  function handleOpen(nextItem: string) {
    setHistory([...history, nextItem]);
    onNavigate(nextItem);
  }

  function handleBack() {
    const previousItems = history.slice(0, -1);
    if (previousItems.length === 0) {
      previousItems.push(ALL_COLLECTIONS_ITEM);
    }
    setHistory(previousItems);
    onNavigate(previousItems[previousItems.length - 1]);
  }

  return (
    <Stack h="100vh" gap={0}>
      {item !== ALL_COLLECTIONS_ITEM && (
        <Box px="lg" pt="md">
          <Button
            variant="subtle"
            leftSection={<Icon name="chevronleft" />}
            onClick={handleBack}
          >
            {t`Back to collections`}
          </Button>
        </Box>
      )}
      <Box flex={1} mih={0}>
        <PreviewItem item={item} onOpen={handleOpen} />
      </Box>
    </Stack>
  );
}

interface PreviewItemProps {
  item: string;
  onOpen: (item: string) => void;
}

function PreviewItem({ item, onOpen }: PreviewItemProps) {
  const previewItem = item === NOT_FOUND_ITEM ? null : parseItem(item);

  return match(previewItem)
    .with({ type: "collection" }, ({ id }) => (
      <Box h="100%" p="md" style={{ overflowY: "auto" }}>
        <CollectionBrowser
          collectionId={id}
          onClick={(clicked) => onOpen(getItemOfCollectionItem(clicked))}
        />
      </Box>
    ))
    .with({ type: "dashboard" }, ({ id }) => (
      <InteractiveDashboard
        dashboardId={id}
        withDownloads
        style={{ height: "100%" }}
        drillThroughQuestionProps={{ isSaveEnabled: false }}
      />
    ))
    .with({ type: "question" }, ({ id }) => (
      <Box h="100%" px="md">
        <InteractiveQuestion
          questionId={id}
          height="100%"
          withDownloads
          isSaveEnabled={false}
        />
      </Box>
    ))
    .with(null, () => <NotFound />)
    .exhaustive();
}

function getItemOfCollectionItem({
  id,
  model,
}: Pick<MetabaseCollectionItem, "id" | "model">) {
  const type = match(model)
    .with("collection", () => "collection")
    .with("dashboard", () => "dashboard")
    .otherwise(() => "question");

  return `${type}/${id}`;
}
