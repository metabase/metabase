import { useMemo, useState } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  Card,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import { isReadableCard } from "metabase-types/guards/card";

import { ContentItemLink } from "./ContentItemLink";
import type { ContentItem, ContentOwner } from "./types";
import { useContentColumns } from "./use-content-columns";
import { filterContentItems } from "./utils";

type ContentsTableProps = {
  items: ContentItem[];
  owner: ContentOwner;
  emptyMessage: string;
};

export function ContentsTable({
  items,
  owner,
  emptyMessage,
}: ContentsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredItems = useMemo(
    () => filterContentItems(items, searchQuery),
    [items, searchQuery],
  );
  const columns = useContentColumns(owner);
  const treeTableInstance = useTreeTableInstance({
    data: filteredItems,
    columns,
    getNodeId: (item) => String(item.id),
  });

  return (
    <Stack gap="lg">
      <TextInput
        placeholder={t`Search...`}
        leftSection={<Icon name="search" />}
        bdrs="sm"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <Card withBorder p={0}>
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          emptyState={
            <ListEmptyState
              label={
                searchQuery ? t`No results for "${searchQuery}"` : emptyMessage
              }
            />
          }
          renderRowLink={(row, { className, children }) =>
            isReadableCard(row.original) ? (
              <ContentItemLink item={row.original} className={className}>
                {children}
              </ContentItemLink>
            ) : (
              <div className={className}>{children}</div>
            )
          }
        />
      </Card>
    </Stack>
  );
}
