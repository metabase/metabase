import type { CSSProperties, ComponentProps, Key, ReactNode } from "react";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Link } from "metabase/common/components/Link";
import { VirtualizedGrid } from "metabase/common/components/VirtualizedGrid";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Card,
  Flex,
  Group,
  Icon,
  type IconName,
  Loader,
  Title,
} from "metabase/ui";

import styles from "./CollectionListView.module.css";

type Crumb = NonNullable<ComponentProps<typeof BrowserCrumbs>["crumbs"]>;

type CollectionListItem = {
  key: Key;
  name: ReactNode;
  icon: IconName;
  link: string;
};

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
    <Link to={item.link}>
      <Card shadow="none" withBorder className={styles.card}>
        <Group gap="xs">
          <Icon name={item.icon} className={CS.mr1} size={18} />

          <Title order={6} component="h3">
            {item.name}
          </Title>
        </Group>
      </Card>
    </Link>
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
          <Flex justify="center" align="center" h="100%">
            <Loader size="lg" />
          </Flex>
        ) : (
          <VirtualizedGrid
            items={items}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            columnsPerRow={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 4 }}
            estimatedRowHeight={80}
          />
        )}
      </Box>
    </Flex>
  );
};
