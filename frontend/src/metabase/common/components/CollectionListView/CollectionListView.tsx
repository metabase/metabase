import type { CSSProperties, ComponentProps, Key, ReactNode } from "react";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Grid, GridItem } from "metabase/common/components/Grid";
import Link from "metabase/common/components/Link";
import { PaginationControls } from "metabase/common/components/PaginationControls";
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

type PaginationProps = {
  page: number;
  pageSize: number;
  total?: number;
  itemsLength: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
};

type CollectionListViewProps = {
  crumbs: Crumb;
  loading?: boolean;
  items: CollectionListItem[];
  containerStyle?: CSSProperties;
  containerClassName?: string;
  pagination?: PaginationProps;
};

export const CollectionListView = ({
  crumbs,
  loading = false,
  items,
  containerStyle,
  containerClassName,
  pagination,
}: CollectionListViewProps) => {
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
      <Box style={{ flexGrow: 1, overflowY: "auto" }} pr="0.5rem">
        {loading ? (
          <Flex justify="center" align="center" h="100%">
            <Loader size="lg" />
          </Flex>
        ) : (
          <Grid>
            {items.map((item) => (
              <GridItem
                key={item.key}
                role="list-item"
                className={styles.listGridItem}
              >
                <Link to={item.link}>
                  <Card
                    shadow="none"
                    withBorder
                    className={styles.card}
                    style={{ cursor: "pointer" }}
                  >
                    <Group gap="xs">
                      <Icon name={item.icon} className={CS.mr1} size={18} />
                      <Title order={6} component="h3">
                        {item.name}
                      </Title>
                    </Group>
                  </Card>
                </Link>
              </GridItem>
            ))}
          </Grid>
        )}
      </Box>
      {pagination && (
        <Flex justify="end" className={CS.syncStatusAwarePagination}>
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            itemsLength={pagination.itemsLength}
            onNextPage={pagination.onNextPage}
            onPreviousPage={pagination.onPreviousPage}
          />
        </Flex>
      )}
    </Flex>
  );
};
