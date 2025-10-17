import cx from "classnames";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { useAsync, useLocalStorage } from "react-use";
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
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import Segments from "metabase/entities/segments";
import { connect, useDispatch } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";
import type Segment from "metabase-lib/v1/metadata/Segment";

import { SegmentActionSelect } from "../components/SegmentActionSelect";

interface SegmentListAppProps {
  onCollapse?: () => void;
  segments: Segment[];
  setArchived: (segment: Segment, archived: boolean) => void;
  params: { id?: string };
}

function SegmentListAppInner({ onCollapse, ...props }: SegmentListAppProps) {
  const { segments, setArchived, params } = props;
  const dispatch = useDispatch();

  const { loading: isLoadingTables } = useAsync(() => {
    const tableIds = new Set(segments.map((s) => s.table_id));
    return Promise.all(
      [...tableIds].map((id) =>
        dispatch(tableApi.endpoints.getTable.initiate({ id })),
      ),
    );
  }, [dispatch, segments]);

  const [display = "tree", setDisplay] = useLocalStorage<
    "tree" | "alphabetical"
  >("metabase-bench-segments-display");
  const treeData = useMemo((): ITreeNodeItem[] => {
    if (isLoadingTables || display !== "tree") {
      return [];
    }
    type Tier<T> = (t: T) => ITreeNodeItem;
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
        data: segment,
      });
    });
    const recursiveAlpha = (node: ITreeNodeItem) => {
      node.children?.sort((a, b) => a.name.localeCompare(b.name));
      node.children?.forEach(recursiveAlpha);
      return node;
    };
    return recursiveAlpha(root).children || [];
  }, [display, isLoadingTables, segments]);

  const selectedId = params.id ? +params.id : undefined;

  return (
    <ItemsListSection
      sectionTitle={t`Segments`}
      testId="segment-list-app"
      onCollapse={onCollapse}
      addButton={
        <ItemsListAddButton
          aria-label={t`New segment`}
          onClick={() => dispatch(push("/bench/segment/new"))}
        />
      }
      settings={
        <ItemsListSettings
          values={{ display }}
          settings={[
            {
              name: "display",
              options: [
                {
                  label: t`Segment table`,
                  value: "tree",
                },
                {
                  label: t`Alphabetical`,
                  value: "alphabetical",
                },
              ],
            },
          ]}
          onSettingChange={(updates) =>
            updates.display && setDisplay(updates.display)
          }
        />
      }
      listItems={
        display === "tree" ? (
          <Box mx="-sm">
            <Tree
              data={treeData}
              selectedId={selectedId}
              initiallyExpanded
              onSelect={(node) => {
                if (!node.children?.length) {
                  dispatch(push(`/bench/segment/${node.id}`));
                }
              }}
              TreeNode={ItemsListTreeNode}
              rightSection={(node) => {
                const segment = node.data as Segment;
                return !segment || node.children?.length ? null : (
                  <div onClick={(e) => e.stopPropagation()}>
                    <SegmentActionSelect
                      segment={segment}
                      onRetire={() => setArchived(segment, true)}
                    />
                  </div>
                );
              }}
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
