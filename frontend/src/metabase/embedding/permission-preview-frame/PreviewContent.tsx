import { Fragment, useEffect, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { SdkBreadcrumbsProvider } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type { MetabaseCollectionItem } from "embedding-sdk-bundle/types/collection";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  ALL_COLLECTIONS_ITEM,
  NOT_FOUND_ITEM,
  parseItem,
} from "metabase/embedding/permission-preview/item";
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";

interface PreviewContentProps {
  initialItem: string;
  onNavigate: (item: string) => void;
}

export function PreviewContent({
  initialItem,
  onNavigate,
}: PreviewContentProps) {
  const initialPreviewItem = parseItem(initialItem);
  const initialCollectionId =
    initialPreviewItem?.type === "collection" ? initialPreviewItem.id : null;

  // An opened dashboard or question goes over the collection browser, which keeps its place
  const [openItem, setOpenItem] = useState<string | null>(
    initialCollectionId == null ? initialItem : null,
  );
  const [browserItem, setBrowserItem] = useState(
    initialCollectionId == null ? ALL_COLLECTIONS_ITEM : initialItem,
  );
  const shownItem = openItem ?? browserItem;

  useEffect(() => {
    onNavigate(shownItem);
  }, [shownItem, onNavigate]);

  function handleClick(clicked: Pick<MetabaseCollectionItem, "id" | "model">) {
    // The browser follows collections itself and reports where it went
    if (clicked.model !== "collection") {
      setOpenItem(getItemOfCollectionItem(clicked));
    }
  }

  return (
    <>
      {/* Kept mounted, so Back returns to the collection the item was opened from. Collapsed rather than
          `display: none`: the browser holds the SDK's first portal root, where the open item's tooltips go. */}
      <Box
        p={openItem == null ? "md" : 0}
        h={openItem == null ? "100vh" : 0}
        style={{ overflowY: openItem == null ? "auto" : "hidden" }}
      >
        <SdkBreadcrumbsProvider>
          <Stack gap="sm">
            <BrowserBreadcrumbs />
            <CollectionBrowser
              collectionId={initialCollectionId ?? "all"}
              onClick={handleClick}
            />
          </Stack>
          <BrowserLocation onChange={setBrowserItem} />
        </SdkBreadcrumbsProvider>
      </Box>
      {openItem != null && (
        <Stack h="100vh" gap={0}>
          <Box px="lg" pt="md" bg="background_page-primary">
            <Button
              variant="subtle"
              leftSection={<Icon name="chevronleft" />}
              onClick={() => setOpenItem(null)}
            >
              {t`Back`}
            </Button>
          </Box>
          <Box flex={1} mih={0}>
            <PreviewItem item={openItem} />
          </Box>
        </Stack>
      )}
    </>
  );
}

/** The trail of collections the browser went through, each going back to it. */
function BrowserBreadcrumbs() {
  const { breadcrumbs, navigateTo } = useSdkBreadcrumbs();

  return (
    <Flex align="center" gap="sm" data-testid="sdk-breadcrumbs">
      {breadcrumbs.map((breadcrumb, index) => (
        <Fragment key={`${breadcrumb.type}-${breadcrumb.id}`}>
          {index > 0 && (
            <Text fz="sm" fw="bold" c="text-secondary">
              /
            </Text>
          )}
          <Breadcrumb icon="folder" onClick={() => navigateTo(breadcrumb)}>
            {breadcrumb.name}
          </Breadcrumb>
        </Fragment>
      ))}
    </Flex>
  );
}

/** Reports the collection the browser is in, as the SDK's breadcrumbs track it. */
function BrowserLocation({ onChange }: { onChange: (item: string) => void }) {
  const { currentLocation } = useSdkBreadcrumbs();
  const item = match(currentLocation)
    .with({ type: "all-collections" }, () => ALL_COLLECTIONS_ITEM)
    .with({ type: "collection" }, ({ id }) => `collection/${id}`)
    .otherwise(() => null);

  useEffect(() => {
    if (item != null) {
      onChange(item);
    }
  }, [item, onChange]);

  return null;
}

function PreviewItem({ item }: { item: string }) {
  const previewItem = item === NOT_FOUND_ITEM ? null : parseItem(item);

  return match(previewItem)
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
    .otherwise(() => <NotFound />);
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
