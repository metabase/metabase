import cx from "classnames";
import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { SegmentItem } from "metabase/admin/datamodel/components/SegmentItem";
import { tableApi } from "metabase/api/table";
import {
  ItemsListAddButton,
  ItemsListSection,
} from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "metabase/bench/components/ItemsListSection/ItemsListSettings";
import { ItemsListTreeNode } from "metabase/bench/components/ItemsListSection/ItemsListTreeNode";
import { useItemsListQuery } from "metabase/bench/components/ItemsListSection/useItemsListQuery";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import Segments from "metabase/entities/segments";
import { connect, useDispatch } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";
import type Segment from "metabase-lib/v1/metadata/Segment";

interface SegmentListAppProps {
  onCollapse?: () => void;
  segments: Segment[];
  setArchived: (segment: Segment, archived: boolean) => void;
  location: Location;
  params: { id?: string };
}

function SegmentListAppInner({ onCollapse, ...props }: SegmentListAppProps) {
  const { segments, setArchived, location, params } = props;
  const dispatch = useDispatch();

  useEffect(() => {
    const tableIds = new Set(segments.map((s) => s.table_id));
    tableIds.forEach((id) =>
      dispatch(tableApi.endpoints.getTable.initiate({ id })),
    );
  }, [dispatch, segments]);

  const listSettingsProps = useItemsListQuery({
    settings: [
      {
        name: "display",
        options: [
          {
            label: t`Segment table`,
            value: "segment-table",
          },
          {
            label: t`Alphabetical`,
            value: "alphabetical",
          },
        ],
      },
    ],
    defaults: { display: "segment-table" },
    location,
  });

  const { query } = location;

  const treeData = useMemo((): ITreeNodeItem[] => {
    type Tier<T> = (s: T) => ITreeNodeItem;
    const tiers: Tier<Segment>[] = [
      (s) => ({
        id: `database-${s.table?.db_id}`,
        name: s.table?.db?.name || t`Unknown`,
        icon: "database",
      }),
      (s) => ({
        id: `schema-${s.table?.schema?.id}`,
        name: s.table?.schema?.name || t`Unknown`,
        icon: "folder",
      }),
      (s) => ({
        id: `table-${s.table?.id}`,
        name: s.table?.display_name || t`Unknown`,
        icon: "table2",
      }),
    ];
    const nodes: Record<string | number, ITreeNodeItem> = {};
    const root: ITreeNodeItem = {
      id: "root",
      name: "root",
      icon: "empty",
      children: [],
    };
    segments.forEach((segment) => {
      let prev = root;
      tiers.forEach((tier) => {
        let node = tier(segment);
        const existingNode = nodes[node.id];
        if (!existingNode) {
          node = { ...node, children: [] };
          nodes[node.id] = node;
          prev.children?.push(node);
        } else {
          node = existingNode;
        }
        prev = node;
      });
      prev.children?.push({
        id: segment.id,
        name: segment.name,
        icon: "segment",
      });
    });
    const recursiveAlpha = (node: ITreeNodeItem) => {
      node.children?.sort((a, b) => a.name.localeCompare(b.name));
      node.children?.forEach(recursiveAlpha);
      return node;
    };
    return recursiveAlpha(root).children || [];
  }, [segments]);

  const selectedId = params.id ? +params.id : undefined;

  return (
    <ItemsListSection
      sectionTitle={t`Segments`}
      onCollapse={onCollapse}
      addButton={
        <ItemsListAddButton
          onClick={() =>
            dispatch(push({ query, pathname: "/bench/segment/new" }))
          }
        />
      }
      settings={<ItemsListSettings {...listSettingsProps} />}
      listItems={
        listSettingsProps.values.display === "segment-table" ? (
          <Box mx="-sm">
            <Tree
              data={treeData}
              selectedId={selectedId}
              onSelect={(node) => {
                if (!node.children?.length) {
                  dispatch(
                    push({ query, pathname: `/bench/segment/${node.id}` }),
                  );
                }
              }}
              TreeNode={ItemsListTreeNode}
            />
          </Box>
        ) : (
          <Stack gap="xs">
            {segments.map((segment) => (
              <SegmentItem
                key={segment.id}
                onRetire={() => setArchived(segment, true)}
                segment={segment}
                isActive={selectedId === segment.id}
              />
            ))}
            {segments.length === 0 && (
              <div
                className={cx(CS.flex, CS.layoutCentered, CS.m4, CS.textMedium)}
              >
                {t`Create segments to add them to the Filter dropdown in the query builder`}
              </div>
            )}
          </Stack>
        )
      }
    />
  );
}

export const SegmentListApp = _.compose(
  Segments.loadList(),
  connect(null, { setArchived: Segments.actions.setArchived }),
)(SegmentListAppInner);
