import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { Card, Flex, Skeleton, Stack } from "metabase/ui";

import S from "./BrowseContainer.module.css";
import { BrowseDataHeader } from "./BrowseDataHeader";
import { BrowseGrid } from "./BrowseGrid";

type BrowseCardSize = "md" | "lg";

const CARD_HEIGHTS: Record<BrowseCardSize, string> = {
  md: "4rem",
  lg: "8.5rem",
};

const CARD_ICON_SIZES: Record<BrowseCardSize, number> = {
  md: 16,
  lg: 32,
};

const CARD_TITLE_WIDTHS = ["55%", "40%", "65%", "45%", "60%", "50%"];

const BrowseCardSkeleton = ({
  size,
  index,
}: {
  size: BrowseCardSize;
  index: number;
}) => (
  <Card withBorder shadow="none" h={CARD_HEIGHTS[size]} p="1.5rem">
    <Flex
      direction={size === "lg" ? "column" : "row"}
      align={size === "lg" ? "flex-start" : "center"}
      justify="space-between"
      gap="sm"
      h="100%"
    >
      <Skeleton
        h={CARD_ICON_SIZES[size]}
        w={CARD_ICON_SIZES[size]}
        radius="xs"
        flex="none"
      />
      <Skeleton
        h={14}
        w={CARD_TITLE_WIDTHS[index % CARD_TITLE_WIDTHS.length]}
        radius="xs"
        mr={size === "md" ? "auto" : undefined}
      />
    </Flex>
  </Card>
);

export type BrowseCardsSkeletonProps = {
  cards: number;
  size?: BrowseCardSize;
  /** Adds the breadcrumbs row that sits above schema and table grids. */
  withCrumbs?: boolean;
};

/** A grid of browse cards, optionally under a breadcrumbs row. */
export const BrowseCardsSkeleton = ({
  cards,
  size = "md",
  withCrumbs = false,
}: BrowseCardsSkeletonProps) => (
  <Stack gap={0}>
    {withCrumbs && (
      <Flex align="center" mih={32} mt="lg" mb="sm">
        <Skeleton h={12} w={200} radius="xs" />
      </Flex>
    )}
    <BrowseGrid pt={withCrumbs ? "xl" : undefined}>
      {Array.from({ length: cards }, (_, index) => (
        <BrowseCardSkeleton key={index} size={size} index={index} />
      ))}
    </BrowseGrid>
  </Stack>
);

/** A whole browse page, with its real header, while its data loads. */
export const BrowsePageSkeleton = (props: BrowseCardsSkeletonProps) => (
  <Flex
    className={S.browseContainer}
    flex={1}
    direction="column"
    wrap="nowrap"
    pt="lg"
  >
    <BrowseDataHeader />
    <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
      <LoadingSkeleton maw="64rem" mx="auto" w="100%">
        <BrowseCardsSkeleton {...props} />
      </LoadingSkeleton>
    </Flex>
  </Flex>
);
