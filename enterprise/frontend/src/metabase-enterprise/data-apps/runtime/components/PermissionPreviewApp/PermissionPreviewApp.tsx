import { Fragment, useEffect, useState } from "react";
import { t } from "ttag";

import { SdkBreadcrumbsProvider } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type { SdkBreadcrumbItem } from "embedding-sdk-bundle/types/breadcrumb";
import type {
  MetabaseCollectionItem,
  SdkCollectionId,
} from "embedding-sdk-bundle/types/collection";
import {
  CollectionBrowser,
  InteractiveDashboard,
  InteractiveQuestion,
} from "embedding-sdk-package";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { Box, Button, Center, Flex, Icon, Stack, Text } from "metabase/ui";
import {
  CONTENT_PREVIEW_ALL_COLLECTIONS_PATH,
  type ContentPreviewItem,
  getContentPreviewItemPath,
} from "metabase-enterprise/permission_preview/content-preview";

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
      <Text c="text-secondary">{t`Open this preview from the Troubleshoot tab in the permissions settings.`}</Text>
    </Center>
  );
}

type PreviewContentProps = {
  /** The item to show first; the collection browser when null or a collection. */
  initialItem?: ContentPreviewItem | null;
  /**
   * Called with the app's path of what the frame shows: the dashboard or question open, else the collection the
   * browser is in, or `CONTENT_PREVIEW_ALL_COLLECTIONS_PATH` at its top.
   */
  onLocationChange?: (path: string) => void;
};

/** The SDK's collection browser, then the dashboard or question clicked in it. */
export function PreviewContent({
  initialItem = null,
  onLocationChange,
}: PreviewContentProps) {
  const [item, setItem] = useState<ContentPreviewItem | null>(
    initialItem?.type === "collection" ? null : initialItem,
  );
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const browserCollectionId: SdkCollectionId | "all" =
    initialItem?.type === "collection" ? initialItem.id : "all";
  const path = item != null ? getContentPreviewItemPath(item) : browserPath;

  useEffect(() => {
    if (path != null) {
      onLocationChange?.(path);
    }
  }, [path, onLocationChange]);

  const handleItemClick = (clicked: MetabaseCollectionItem) => {
    if (typeof clicked.id !== "number") {
      return;
    }
    if (clicked.model === "dashboard") {
      setItem({ type: "dashboard", id: clicked.id });
    } else if (QUESTION_MODELS.has(clicked.model)) {
      setItem({ type: getQuestionType(clicked.model), id: clicked.id });
    }
  };

  return (
    <>
      {/* Kept mounted, so going back returns to the collection the item was opened from. Collapsed rather than
          `display: none`: the browser holds the SDK's first portal root, where the open item's tooltips and popovers go. */}
      <Box
        p={item == null ? "lg" : 0}
        h={item == null ? undefined : 0}
        style={item == null ? undefined : { overflow: "hidden" }}
      >
        {/* The SDK's own breadcrumbs are the only way to learn which collection the browser moved to, crumbs included. */}
        <SdkBreadcrumbsProvider>
          <Stack gap="sm">
            <BrowserBreadcrumbs />
            <CollectionBrowser
              collectionId={browserCollectionId}
              visibleEntityTypes={[
                "collection",
                "dashboard",
                "question",
                "model",
              ]}
              onClick={handleItemClick}
            />
          </Stack>
          <BrowserLocation onChange={setBrowserPath} />
        </SdkBreadcrumbsProvider>
      </Box>
      {item != null && (
        <Stack gap={0} h="100vh">
          <Box px="lg" pt="md">
            <Button
              variant="subtle"
              leftSection={<Icon name="chevronleft" />}
              onClick={() => setItem(null)}
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

function getQuestionType(model: string): ContentPreviewItem["type"] {
  switch (model) {
    case "dataset":
      return "model";
    case "metric":
      return "metric";
    default:
      return "question";
  }
}

/**
 * The trail of collections the browser went through, each going back to it. The SDK's own `SdkBreadcrumbs` can't
 * render here: its content-translation hook changes once this document's plugins load, which breaks the hook order.
 */
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

/** Reports the path of the collection the browser around it is in, as the SDK's breadcrumbs track it. */
function BrowserLocation({ onChange }: { onChange: (path: string) => void }) {
  const { currentLocation } = useSdkBreadcrumbs();
  const path = currentLocation != null ? getBrowserPath(currentLocation) : null;

  useEffect(() => {
    if (path != null) {
      onChange(path);
    }
  }, [path, onChange]);

  return null;
}

function getBrowserPath(location: SdkBreadcrumbItem): string | null {
  switch (location.type) {
    case "all-collections":
      return CONTENT_PREVIEW_ALL_COLLECTIONS_PATH;
    case "collection":
      return `/collection/${location.id}`;
    default:
      return null;
  }
}
