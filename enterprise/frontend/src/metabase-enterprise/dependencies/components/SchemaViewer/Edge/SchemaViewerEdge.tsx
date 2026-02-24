import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData } from "../types";

import S from "./SchemaViewerEdge.module.css";

const CARDINALITY_LABELS = {
  "one-to-one": { source: "1", target: "1" },
  "many-to-one": { source: "N", target: "1" },
} as const;

function getCardinalityLabel(relationship: SchemaViewerEdgeData["relationship"]): {
  source: string;
  target: string;
} {
  return CARDINALITY_LABELS[relationship] ?? CARDINALITY_LABELS["many-to-one"];
}

function CardinalitySymbol({ symbol }: { symbol: string }) {
  // if (symbol === "N") {
  //   return <span className={S.asterisk}>*</span>;
  // }
  return <>{symbol}</>;
}

function CardinalityLabel({
  source,
  target,
}: {
  source: string;
  target: string;
}) {
  return (
    <>
      <CardinalitySymbol symbol={source} />
      <span className={S.colon}>:</span>
      <CardinalitySymbol symbol={target} />
    </>
  );
}

export const SchemaViewerEdge = memo(function SchemaViewerEdge(
  props: EdgeProps<SchemaViewerEdgeData>,
) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const isHidden = !isInitialized;
  const animationClass = "schema-viewer-edge-march";

  const relationship = props.data?.relationship ?? "many-to-one";
  const cardinality = useMemo(
    () => getCardinalityLabel(relationship),
    [relationship],
  );

  const style = useMemo(
    () => ({
      strokeWidth: 1.5,
      stroke: palette["border"],
      ...(isHidden ? { visibility: "hidden" as const } : {}),
    }),
    [palette, isHidden],
  );

  if (isSelfRef) {
    const { sourceX, sourceY, targetX, targetY } = props;
    const offset = 50;
    const r = 8;

    const midX = Math.max(sourceX, targetX) + offset;

    const edgePath = [
      `M ${sourceX} ${sourceY}`,
      `L ${midX - r} ${sourceY}`,
      `Q ${midX} ${sourceY} ${midX} ${sourceY + (sourceY < targetY ? r : -r)}`,
      `L ${midX} ${targetY + (sourceY < targetY ? -r : r)}`,
      `Q ${midX} ${targetY} ${midX - r} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(" ");

    const labelX = midX + 8;
    const labelY = (sourceY + targetY) / 2;

    const labelStyle = {
      transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      ...(isHidden ? { visibility: "hidden" as const } : {}),
    };

    return (
      <>
        <BaseEdge
          path={edgePath}
          markerEnd={props.markerEnd}
          style={style}
          className={animationClass}
        />
        <EdgeLabelRenderer>
          <div
            className={S.cardinalityLabel}
            style={labelStyle}
          >
            <CardinalityLabel
              source={cardinality.source}
              target={cardinality.target}
            />
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const labelStyle = {
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
    ...(isHidden ? { visibility: "hidden" as const } : {}),
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={props.markerEnd}
        style={style}
        className={animationClass}
      />
      <EdgeLabelRenderer>
        <div
          className={S.cardinalityLabel}
          style={labelStyle}
        >
          <CardinalityLabel
            source={cardinality.source}
            target={cardinality.target}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
