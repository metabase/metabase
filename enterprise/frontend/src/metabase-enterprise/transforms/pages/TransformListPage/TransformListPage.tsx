import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { TreeColumnDef } from "metabase/ui";
import { Card, Flex, Group, Icon, Stack, TextInput } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import { CreateTransformMenu } from "metabase-enterprise/transforms/components/CreateTransformMenu";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { Transform } from "metabase-types/api";

export const TransformListPage = () => {
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

  const transformColumnDef = useMemo<
    TreeColumnDef<Transform & { id: number }>[]
  >(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        cell: ({ value }) => (
          <Group data-testid="transform-name" gap="sm">
            <Icon name="transform" c="brand" />
            {value as string}
          </Group>
        ),
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: t`Last Modified`,
        cell: ({ value }) => {
          return value && <DateTime value={value as string} />;
        },
      },
      {
        id: "output_table",
        accessorFn: (transform) => transform.target.name,
        header: t`Output table`,
      },
    ],
    [],
  );

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
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
        px="3.5rem"
        showMetabotButton
        py={0}
      />
      <Stack
        bg="background-light"
        data-testid="transforms-list"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
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
              columns={transformColumnDef}
              onSelect={handleSelect}
            />
          )}
        </Card>
      </Stack>
    </>
  );
};
