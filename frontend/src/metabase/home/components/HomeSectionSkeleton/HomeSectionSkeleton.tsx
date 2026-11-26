import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { Card, Flex, Skeleton } from "metabase/ui";

const CARD_TITLE_WIDTHS = [160, 120, 200, 140, 180];

/** A home page section's caption and its row of item cards. */
export const HomeSectionSkeleton = () => (
  <LoadingSkeleton gap={0}>
    <Flex align="center" h={21} mb={{ base: "xl", xl: "xxl" }}>
      <Skeleton h={14} w={240} radius="xs" />
    </Flex>
    <Flex gap="1.5rem" wrap="wrap">
      {CARD_TITLE_WIDTHS.map((width, index) => (
        <Card
          key={index}
          bg="background_page-primary"
          p={{ base: "lg", lg: "xl" }}
          radius="sm"
          withBorder
        >
          <Flex align="center" gap="lg" h={21}>
            <Skeleton h={16} w={16} radius="xs" flex="none" />
            <Skeleton h={12} w={width} radius="xs" />
          </Flex>
        </Card>
      ))}
    </Flex>
  </LoadingSkeleton>
);
