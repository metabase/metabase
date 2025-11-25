import { useDebouncedValue } from "@mantine/hooks";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { TransformsSectionHeader } from "metabase-enterprise/data-studio/app/pages/TransformsSectionLayout/TransformsSectionHeader";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import { CreateTransformMenu } from "metabase-enterprise/transforms/components/CreateTransformMenu";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { Transform } from "metabase-types/api";

export const TransformListPageSidebar = () => {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

  const { data: transforms, error, isLoading } = useListTransformsQuery({});

  const filteredTransforms = useMemo(() => {
    if (!transforms) {
      return [];
    }

    if (!debouncedSearchQuery) {
      return transforms;
    }

    const query = debouncedSearchQuery.toLowerCase();
    return transforms.filter(
      (transform) =>
        transform.name.toLowerCase().includes(query) ||
        transform.target.name.toLowerCase().includes(query),
    );
  }, [transforms, debouncedSearchQuery]);

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const handleSelect = (item: Transform) => {
    if (typeof item.id === "number") {
      dispatch(push(Urls.transform(item.id)));
    }
  };

  return (
    <>
      <TransformsSectionHeader
        leftSection={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Stack px="3.5rem">
        <Flex gap="md">
          <TextInput
            placeholder="Search..."
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <CreateTransformMenu />
        </Flex>

        <Card withBorder p={0}>
          {isLoading ? (
            <ListLoadingState />
          ) : filteredTransforms.length === 0 ? (
            <ListEmptyState
              label={
                debouncedSearchQuery
                  ? t`No transforms found`
                  : t`No transforms yet`
              }
            />
          ) : (
            <Table
              data={filteredTransforms.map((t) => ({
                ...t,
                out_table: t.target.name,
                last_modified: new Date(t.updated_at).toDateString(),
              }))}
              columns={[
                {
                  accessorKey: "name",
                  meta: {
                    width: "auto",
                  },
                  header: "Name",
                },
                {
                  accessorKey: "updated_at",
                  cell: ({ getValue }) => {
                    const value = getValue() as string;
                    return value && dayjs(value).format("MMM D, h:mm: A");
                  },
                  header: "Last Modified",
                },
                {
                  accessorFn: (transform) => transform.target.name,
                  header: "Output table",
                },
              ]}
              onSelect={handleSelect}
            />
          )}
        </Card>
      </Stack>
    </>
  );
};
