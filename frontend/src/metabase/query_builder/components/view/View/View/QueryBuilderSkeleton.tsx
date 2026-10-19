import cx from "classnames";
import { useMemo } from "react";
import { match } from "ts-pattern";

import { cardApi } from "metabase/api";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { parseHash } from "metabase/common/utils/card";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { useLocation, useParams } from "metabase/router";
import { Box, Center, Flex, Repeat, Skeleton, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { b64hash_to_utf8 } from "metabase/utils/encoding";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import ScalarSkeleton from "metabase/visualizations/components/skeletons/ScalarSkeleton/ScalarSkeleton";
import { type CardDisplayType, isCardDisplayType } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { getQueryBuilderModeFromLocation } from "../../../../typed-utils";
import ViewTitleHeaderS from "../../ViewHeader/ViewTitleHeader.module.css";
import { ViewSection } from "../../ViewSection";

export type QueryBuilderSkeletonLayout =
  | { type: "native-editor" }
  | { type: "notebook" }
  /** `display` is undefined when the chart type isn't known yet. */
  | { type: "visualization"; display: CardDisplayType | undefined };

const NATIVE_EDITOR_TOOLBAR_ICON_COUNT = 6;
const NOTEBOOK_ACTION_BUTTON_COUNT = 3;

/**
 * The query builder as it will look once the question loads, drawn while the
 * question is still initializing. The layout is guessed from the URL and, for
 * saved questions, from the card if it's already in the API cache.
 */
export const QueryBuilderSkeleton = () => {
  const layout = useQueryBuilderSkeletonLayout();

  return (
    <LoadingSkeleton className={CS.fullHeight} gap={0}>
      {match(layout)
        .with({ type: "native-editor" }, () => <NativeEditorSkeleton />)
        .with({ type: "notebook" }, () => <NotebookSkeleton />)
        .with({ type: "visualization" }, ({ display }) => (
          <VisualizationViewSkeleton display={display} />
        ))
        .exhaustive()}
    </LoadingSkeleton>
  );
};

function useQueryBuilderSkeletonLayout(): QueryBuilderSkeletonLayout {
  const { pathname, hash } = useLocation();
  const { slug } = useParams();
  // On the /table/:slug route the slug identifies a table, not a saved card.
  const isTableRoute = pathname.startsWith("/table");
  const cardId = isTableRoute ? undefined : Urls.extractEntityId(slug);

  // The query builder loads the card with these exact args, so once that
  // request resolves the skeleton switches to the card's real chart type.
  const selectCard = useMemo(
    () =>
      cardId == null ? null : cardApi.endpoints.getCard.select({ id: cardId }),
    [cardId],
  );
  const savedCardDisplay = useSelector((state) =>
    selectCard ? selectCard(state).data?.display : undefined,
  );

  return getQueryBuilderSkeletonLayout({
    pathname,
    hash,
    isTableRoute,
    isSavedCard: cardId != null,
    savedCardDisplay,
  });
}

export function getQueryBuilderSkeletonLayout({
  pathname,
  hash,
  isTableRoute,
  isSavedCard,
  savedCardDisplay,
}: {
  pathname: string;
  hash: string;
  isTableRoute: boolean;
  isSavedCard: boolean;
  savedCardDisplay: string | undefined;
}): QueryBuilderSkeletonLayout {
  if (
    getQueryBuilderModeFromLocation({ pathname }).queryBuilderMode ===
    "notebook"
  ) {
    return { type: "notebook" };
  }

  if (isSavedCard) {
    return { type: "visualization", display: toCardDisplay(savedCardDisplay) };
  }

  const { options, serializedCard } = parseHash(hash);
  const card = serializedCard ? parseSerializedCard(serializedCard) : null;
  if (card) {
    // Unsaved native questions open with the SQL editor expanded.
    return isNativeDatasetQuery(card.dataset_query)
      ? { type: "native-editor" }
      : { type: "visualization", display: toCardDisplay(card.display) };
  }

  if (isTableRoute || options.table != null) {
    return { type: "visualization", display: "table" };
  }

  return { type: "visualization", display: undefined };
}

function parseSerializedCard(
  serializedCard: string,
): Record<string, unknown> | null {
  try {
    const card: unknown = JSON.parse(b64hash_to_utf8(serializedCard));
    return isObject(card) ? card : null;
  } catch {
    return null;
  }
}

function isNativeDatasetQuery(datasetQuery: unknown): boolean {
  if (!isObject(datasetQuery)) {
    return false;
  }
  if (datasetQuery.type === "native") {
    return true;
  }
  const firstStage = Array.isArray(datasetQuery.stages)
    ? datasetQuery.stages[0]
    : undefined;
  return isObject(firstStage) && firstStage["lib/type"] === "mbql.stage/native";
}

function toCardDisplay(display: unknown): CardDisplayType | undefined {
  return isCardDisplayType(display) ? display : undefined;
}

const HeaderSkeleton = ({
  titleWidth,
  actionWidths,
}: {
  titleWidth: number;
  actionWidths: number[];
}) => (
  <ViewSection
    className={ViewTitleHeaderS.ViewHeaderContainer}
    justify="space-between"
    mih={64}
  >
    <Skeleton h={20} w={titleWidth} radius="xs" />
    <Flex gap="md" align="center">
      {actionWidths.map((width, index) => (
        <Skeleton key={index} h={20} w={width} radius="xs" />
      ))}
    </Flex>
  </ViewSection>
);

/** Matches the empty SQL editor: toolbar, editor surface and run button, then the results placeholder. */
const NativeEditorSkeleton = () => (
  <>
    <HeaderSkeleton titleWidth={120} actionWidths={[16, 40]} />
    <Stack gap={0} bg="background_page-secondary">
      <Flex h="3rem" align="center" justify="space-between" pl="md" pr="xl">
        <Skeleton h={14} w={128} radius="xs" />
        <Flex gap="xl">
          <Repeat times={NATIVE_EDITOR_TOOLBAR_ICON_COUNT}>
            <Skeleton h={16} w={16} radius="xs" />
          </Repeat>
        </Flex>
      </Flex>
      <Flex
        className={CS.borderTop}
        h="max(16rem, 40vh)"
        justify="space-between"
      >
        <Flex gap="md" p="sm" h="fit-content">
          <Skeleton h={12} w={8} radius="xs" />
          <Skeleton h={12} w={480} maw="60vw" radius="xs" />
        </Flex>
        <Flex align="flex-end" p="lg">
          <Skeleton h={40} w={40} radius="md" />
        </Flex>
      </Flex>
    </Stack>
    <Center className={CS.borderTop} flex={1}>
      <Stack align="center" gap="md">
        <Skeleton h={56} w={56} circle />
        <Skeleton h={14} w={360} radius="xs" mt="sm" />
        <Skeleton h={14} w={200} radius="xs" />
      </Stack>
    </Center>
  </>
);

/** Matches a new question's notebook: the data step and the actions under it. */
const NotebookSkeleton = () => (
  <>
    <HeaderSkeleton titleWidth={120} actionWidths={[64, 40]} />
    <Box p={{ base: "1rem", sm: "2rem" }}>
      <Stack w={`${(11 / 12) * 100}%`} maw="75rem" gap="sm">
        <Skeleton h={14} w={48} radius="xs" />
        <Skeleton h={52} radius="md" />
        <Flex gap="sm" mt="md">
          <Repeat times={NOTEBOOK_ACTION_BUTTON_COUNT}>
            <Skeleton h={32} w={112} radius="md" />
          </Repeat>
        </Flex>
      </Stack>
    </Box>
  </>
);

/** Header, chart of the question's display type, and footer bar. */
const VisualizationViewSkeleton = ({
  display,
}: {
  display: CardDisplayType | undefined;
}) => {
  const isScalar = display === "scalar" || display === "smartscalar";

  return (
    <>
      <HeaderSkeleton titleWidth={240} actionWidths={[64, 80, 32, 32]} />
      <Flex direction="column" flex={1} px="xl" pt="lg" pb="md" mih={0}>
        {isScalar ? <ScalarSkeleton /> : getChartSkeletonImage(display)}
      </Flex>
      <ViewSection
        className={cx(CS.borderTop, CS.fullWidth)}
        justify="space-between"
        py="sm"
      >
        <Skeleton h={32} w={160} radius="sm" />
        <Skeleton h={32} w={200} radius="sm" />
      </ViewSection>
    </>
  );
};
