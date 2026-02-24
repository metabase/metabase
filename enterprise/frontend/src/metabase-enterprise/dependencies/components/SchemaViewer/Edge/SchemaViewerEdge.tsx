import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData } from "../types";

import S from "./SchemaViewerEdge.module.css";

function getCardinalityLabel(relationship: string): {
  source: string;
  target: string;
} {
  switch (relationship) {
    case "one-to-one":
      return { source: "1", target: "1" };
    case "one-to-many":
      return { source: "1", target: "N" };
    case "many-to-one":
      return { source: "N", target: "1" };
    case "many-to-many":
      return { source: "N", target: "N" };
    default:
      return { source: "N", target: "1" };
  }
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

export function SchemaViewerEdge(props: EdgeProps<SchemaViewerEdgeData>) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const hiddenStyle = !isInitialized ? { visibility: "hidden" as const } : {};
  const animationClass = "schema-viewer-edge-march";

  const relationship = props.data?.relationship ?? "many-to-one";
  const cardinality = getCardinalityLabel(relationship);

  const style = {
    strokeWidth: 1.5,
    stroke: palette["border"],
    ...hiddenStyle,
  };

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
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              ...hiddenStyle,
            }}
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
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            ...hiddenStyle,
          }}
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
