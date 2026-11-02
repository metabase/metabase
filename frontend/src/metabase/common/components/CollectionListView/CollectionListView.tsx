import type { CSSProperties, ComponentProps, Key, ReactNode } from "react";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Link } from "metabase/common/components/Link";
import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { VirtualizedGrid } from "metabase/common/components/VirtualizedGrid";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Card,
  Flex,
  Group,
  Icon,
  SimpleGrid,
  Skeleton,
  Title,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import styles from "./CollectionListView.module.css";

type Crumb = NonNullable<ComponentProps<typeof BrowserCrumbs>["crumbs"]>;

type CollectionListItem = {
  key: Key;
  name: ReactNode;
  icon: IconName;
  link: string;
};

const COLUMNS_PER_ROW = { xs: 1, sm: 2, md: 3, lg: 4, xl: 4 };
const SKELETON_CARD_COUNT = 12;

type CollectionListViewProps = {
  crumbs: Crumb;
  loading?: boolean;
  items: CollectionListItem[];
  containerStyle?: CSSProperties;
  containerClassName?: string;
};

export const CollectionListView = ({
  crumbs,
  loading = false,
  items,
  containerStyle,
  containerClassName,
}: CollectionListViewProps) => {
  const renderItem = (item: CollectionListItem) => (
    <Card
      component={Link}
      to={item.link}
      shadow="none"
      withBorder
      className={styles.card}
    >
      <Group gap="xxs">
        <Icon name={item.icon} className={CS.mr1} size={18} />

        <Title order={6} component="h3">
          {item.name}
        </Title>
      </Group>
    </Card>
  );

  return (
    <Flex
      direction="column"
      p="1.5rem"
      h="100%"
      style={containerStyle}
      className={containerClassName}
    >
      <Box py="1rem">
        <BrowserCrumbs crumbs={crumbs} />
      </Box>
      <Box style={{ flexGrow: 1, overflowY: "hidden" }} pr="0.5rem">
        {loading ? (
          <CollectionListSkeleton />
        ) : (
          <VirtualizedGrid
            items={items}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            columnsPerRow={COLUMNS_PER_ROW}
            estimatedRowHeight={80}
          />
        )}
      </Box>
    </Flex>
  );
};

const CollectionListSkeleton = () => (
  <LoadingSkeleton>
    <SimpleGrid
      cols={{
        base: COLUMNS_PER_ROW.xs,
        sm: COLUMNS_PER_ROW.sm,
        md: COLUMNS_PER_ROW.md,
        lg: COLUMNS_PER_ROW.lg,
        xl: COLUMNS_PER_ROW.xl,
      }}
      spacing="lg"
      verticalSpacing="xl"
    >
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <Card key={index} shadow="none" withBorder>
          <Group gap="sm" wrap="nowrap">
            <Skeleton h={18} w={18} radius="xs" flex="none" />
            <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  </LoadingSkeleton>
);
