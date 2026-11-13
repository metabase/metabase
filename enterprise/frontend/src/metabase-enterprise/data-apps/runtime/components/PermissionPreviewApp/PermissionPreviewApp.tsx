import { useEffect, useState } from "react";
import { t } from "ttag";

import type { MetabaseCollectionItem } from "embedding-sdk-bundle/types/collection";
import {
  CollectionBrowser,
  InteractiveDashboard,
  InteractiveQuestion,
} from "embedding-sdk-package";
import { Box, Button, Center, Icon, Stack, Text } from "metabase/ui";

import { reportReadyToParent } from "../../lib/report-ready-to-parent";
import { DataAppProvider } from "../DataAppProvider/DataAppProvider";

type PreviewView =
  | { type: "browser" }
  | { type: "dashboard"; item: MetabaseCollectionItem }
  | { type: "question"; item: MetabaseCollectionItem };

const QUESTION_MODELS = new Set(["card", "dataset", "metric"]);

/**
 * The preview frame on the isolated origin: the SDK's collection browser, then the dashboard or question clicked in
 * it, as the previewed person. It holds no credential: every API request goes through the top page's broker, which
 * stamps the preview grant.
 */
export function PermissionPreviewApp() {
  if (window.parent === window) {
    return (
      <Center h="100vh">
        <Text c="text-secondary">{t`This preview can’t be opened directly.`}</Text>
      </Center>
    );
  }

  return (
    <DataAppProvider appSlug="permission-preview">
      <PreviewContent />
    </DataAppProvider>
  );
}

function PreviewContent() {
  const [view, setView] = useState<PreviewView>({ type: "browser" });

  useEffect(() => {
    reportReadyToParent();
  }, []);

  const handleItemClick = (item: MetabaseCollectionItem) => {
    if (item.model === "dashboard") {
      setView({ type: "dashboard", item });
    } else if (QUESTION_MODELS.has(item.model)) {
      setView({ type: "question", item });
    }
  };

  return (
    <>
      {/* kept mounted, so going back returns to the collection the item was opened from */}
      <Box p="lg" display={view.type === "browser" ? undefined : "none"}>
        <CollectionBrowser
          collectionId="all"
          visibleEntityTypes={["collection", "dashboard", "question", "model"]}
          onClick={handleItemClick}
        />
      </Box>
      {view.type !== "browser" && (
        <Stack gap={0} h="100vh">
          <Box px="lg" pt="md">
            <Button
              variant="subtle"
              leftSection={<Icon name="chevronleft" />}
              onClick={() => setView({ type: "browser" })}
            >
              {t`Back to collections`}
            </Button>
          </Box>
          <Box flex={1} mih={0} style={{ overflow: "auto" }}>
            {view.type === "dashboard" ? (
              <InteractiveDashboard dashboardId={view.item.id} />
            ) : (
              <InteractiveQuestion
                questionId={view.item.id}
                isSaveEnabled={false}
              />
            )}
          </Box>
        </Stack>
      )}
    </>
  );
}
