import { useEffect, useState } from "react";
import { t } from "ttag";

import type {
  MetabaseCollectionItem,
  SdkCollectionId,
} from "embedding-sdk-bundle/types/collection";
import {
  CollectionBrowser,
  InteractiveDashboard,
  InteractiveQuestion,
} from "embedding-sdk-package";
import { Box, Button, Center, Icon, Stack, Text } from "metabase/ui";
import type { ContentPreviewItem } from "metabase-enterprise/permission_preview/content-preview";

import { reportReadyToParent } from "../../lib/report-ready-to-parent";
import { DataAppProvider } from "../DataAppProvider/DataAppProvider";

const QUESTION_MODELS = new Set(["card", "dataset", "metric"]);

/**
 * The preview frame on the isolated origin: the SDK's collection browser, then the dashboard or question clicked in
 * it, as the previewed person. It holds no credential: every API request goes through the top page's broker, which
 * stamps the preview grant.
 */
export function PermissionPreviewApp() {
  useEffect(() => {
    reportReadyToParent();
  }, []);

  if (window.parent === window) {
    return <OpenedDirectly />;
  }

  return (
    <DataAppProvider appSlug="permission-preview">
      <PreviewContent />
    </DataAppProvider>
  );
}

export function OpenedDirectly() {
  return (
    <Center h="100vh">
      <Text c="text-secondary">{t`This preview can’t be opened directly.`}</Text>
    </Center>
  );
}

type PreviewContentProps = {
  /** The item to show first; the collection browser when null or a collection. */
  initialItem?: ContentPreviewItem | null;
  /** Called with the dashboard or question shown, or null when back on the collection browser. */
  onItemChange?: (item: ContentPreviewItem | null) => void;
};

/** The SDK's collection browser, then the dashboard or question clicked in it. */
export function PreviewContent({
  initialItem = null,
  onItemChange,
}: PreviewContentProps) {
  const [item, setItem] = useState<ContentPreviewItem | null>(
    initialItem?.type === "collection" ? null : initialItem,
  );
  const browserCollectionId: SdkCollectionId | "all" =
    initialItem?.type === "collection" ? initialItem.id : "all";

  const showItem = (newItem: ContentPreviewItem | null) => {
    setItem(newItem);
    onItemChange?.(newItem);
  };

  const handleItemClick = (clicked: MetabaseCollectionItem) => {
    if (typeof clicked.id !== "number") {
      return;
    }
    if (clicked.model === "dashboard") {
      showItem({ type: "dashboard", id: clicked.id });
    } else if (QUESTION_MODELS.has(clicked.model)) {
      showItem({ type: "question", id: clicked.id });
    }
  };

  return (
    <>
      {/* kept mounted, so going back returns to the collection the item was opened from */}
      <Box p="lg" display={item == null ? undefined : "none"}>
        <CollectionBrowser
          collectionId={browserCollectionId}
          visibleEntityTypes={["collection", "dashboard", "question", "model"]}
          onClick={handleItemClick}
        />
      </Box>
      {item != null && (
        <Stack gap={0} h="100vh">
          <Box px="lg" pt="md">
            <Button
              variant="subtle"
              leftSection={<Icon name="chevronleft" />}
              onClick={() => showItem(null)}
            >
              {t`Back to collections`}
            </Button>
          </Box>
          <Box flex={1} mih={0} style={{ overflow: "auto" }}>
            {item.type === "dashboard" ? (
              <InteractiveDashboard dashboardId={item.id} />
            ) : (
              <InteractiveQuestion questionId={item.id} isSaveEnabled={false} />
            )}
          </Box>
        </Stack>
      )}
    </>
  );
}
