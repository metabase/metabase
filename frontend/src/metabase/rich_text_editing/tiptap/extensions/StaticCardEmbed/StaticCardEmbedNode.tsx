import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  type StaticCardSort,
  useGetExplorationStaticCardQuery,
} from "metabase/api/exploration";
import { ExplicitSizeRefreshModeContext } from "metabase/common/components/ExplicitSize/ExplicitSize";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import { DocumentMode } from "metabase/visualizations/click-actions/modes/DocumentMode";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { CardDisplayType, RawSeries } from "metabase-types/api";

import { createIdAttribute } from "../NodeIds";

import styles from "./StaticCardEmbedNode.module.css";

const STATIC_CARD_SORTS: ReadonlyArray<StaticCardSort> = [
  "value_asc",
  "value_desc",
  "label_asc",
  "label_desc",
];

const isStaticCardSort = (value: unknown): value is StaticCardSort =>
  typeof value === "string" &&
  (STATIC_CARD_SORTS as ReadonlyArray<string>).includes(value);

export interface StaticCardEmbedAttributes {
  exploration_query_id?: number | null;
  sort?: StaticCardSort | null;
}

export const StaticCardEmbed: Node<{
  HTMLAttributes: StaticCardEmbedAttributes;
}> = Node.create({
  name: "staticCardEmbed",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      exploration_query_id: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-exploration-query-id");
          if (!raw) {
            return null;
          }
          const parsed = parseInt(raw, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
      },
      sort: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-sort");
          return isStaticCardSort(raw) ? raw : null;
        },
      },
      ...createIdAttribute(),
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${StaticCardEmbed.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const dataAttrs: Record<string, string> = {
      "data-type": StaticCardEmbed.name,
    };
    if (node.attrs.exploration_query_id != null) {
      dataAttrs["data-exploration-query-id"] = String(
        node.attrs.exploration_query_id,
      );
    }
    if (node.attrs.sort != null) {
      dataAttrs["data-sort"] = String(node.attrs.sort);
    }
    return ["div", mergeAttributes(HTMLAttributes, dataAttrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StaticCardEmbedComponent);
  },
});

const StaticCardEmbedComponent = ({ node, selected }: NodeViewProps) => {
  const metadata = useSelector(getMetadata);
  const explorationQueryId = node.attrs.exploration_query_id as number | null;
  const sort = isStaticCardSort(node.attrs.sort) ? node.attrs.sort : undefined;

  const { data, isLoading, error } = useGetExplorationStaticCardQuery(
    { id: explorationQueryId ?? 0, sort },
    { skip: !explorationQueryId },
  );

  const series = useMemo<RawSeries | null>(() => {
    if (!data?.card || !data?.dataset) {
      return null;
    }
    return [
      {
        card: data.card,
        started_at: data.dataset.started_at,
        data: data.dataset.data,
      },
    ];
  }, [data]);

  const display = (data?.card?.display ?? "table") as CardDisplayType;

  return (
    <NodeViewWrapper
      data-type="staticCardEmbed"
      data-testid="document-static-card-embed"
    >
      <Box
        className={cx(styles.staticCardEmbed, {
          [styles.selected]: selected,
        })}
      >
        {data?.card?.name ? (
          <Box className={styles.title}>{data.card.name}</Box>
        ) : null}
        <Box className={styles.body}>
          {error ? (
            <Box className={styles.errorState}>
              {t`This chart couldn't be loaded.`}
            </Box>
          ) : !series || isLoading ? (
            <ChartSkeleton display={display} />
          ) : (
            <ExplicitSizeRefreshModeContext.Provider value="layout">
              <Visualization
                rawSeries={series}
                metadata={metadata}
                mode={DocumentMode}
                getExtraDataForClick={() => ({})}
                isEditing={false}
                isDashboard={false}
                isDocument={true}
                showTitle={false}
              />
            </ExplicitSizeRefreshModeContext.Provider>
          )}
        </Box>
      </Box>
    </NodeViewWrapper>
  );
};
