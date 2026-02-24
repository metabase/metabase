import { Slider } from "@mantine/core";
import { useState } from "react";
import { t } from "ttag";

import { Group, Text } from "metabase/ui";

import S from "./HopsInput.module.css";

interface HopsInputProps {
  value: number;
  onChange: (value: number) => void;
}

function useSliderValue(value: number, onChange: (value: number) => void) {
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (newValue: number) => {
    setIsDragging(true);
    setLocalValue(newValue);
  };

  const handleChangeEnd = (newValue: number) => {
    setIsDragging(false);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  // Sync local value with prop when not dragging
  const displayValue = isDragging ? localValue : value;

  return { displayValue, handleChange, handleChangeEnd, isDragging };
}

const MIN_HOPS = 0;
const MAX_HOPS = 5;

const MARKS = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
];

interface MiniGraphProps {
  depth: number;
}

function MiniGraph({ depth }: MiniGraphProps) {
  // Linear horizontal layout showing steps from focal node
  const nodeCount = depth + 1;
  const padding = 4;
  const width = 48;
  const height = 20;
  const centerY = height / 2;

  // Calculate spacing to fit all nodes
  const focalRadius = 4;
  const nodeRadius = 2.5;
  const availableWidth = width - padding * 2 - focalRadius - nodeRadius;
  const spacing = depth > 0 ? availableWidth / depth : 0;

  const nodes = [];
  const edges = [];

  for (let i = 0; i <= depth; i++) {
    const x = padding + focalRadius + i * spacing;
    nodes.push({ x, y: centerY, depth: i });

    if (i > 0) {
      const prevX = padding + focalRadius + (i - 1) * spacing;
      edges.push({ x1: prevX, y1: centerY, x2: x, y2: centerY });
    }
  }

  return (
    <Box className={S.miniGraph}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {edges.map((edge, i) => (
          <line
            key={`edge-${i}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            className={S.edge}
          />
        ))}

        {nodes.map((node, i) => (
          <circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={node.depth === 0 ? focalRadius : nodeRadius}
            className={`${S.node} ${node.depth === 0 ? S.nodeFocal : ""}`}
          />
        ))}
      </svg>
    </Box>
  );
}

export function HopsInput({ value, onChange }: HopsInputProps) {
  const { displayValue, handleChange, handleChangeEnd } =
    useSliderValue(value, onChange);

  return (
    <Group
      className={S.container}
      gap="sm"
      align="center"
      wrap="nowrap"
      data-testid="hops-input"
    >
      <Text fw={700} className={S.label}>{t`Steps`}</Text>
      <Slider
        value={displayValue}
        onChange={handleChange}
        onChangeEnd={handleChangeEnd}
        min={MIN_HOPS}
        max={MAX_HOPS}
        marks={MARKS}
        restrictToMarks
        size="sm"
        label={null}
        thumbChildren={<span className={S.thumbValue}>{displayValue}</span>}
        classNames={{
          root: S.sliderRoot,
          track: S.sliderTrack,
          bar: S.sliderBar,
          thumb: S.sliderThumb,
          mark: S.sliderMark,
        }}
        data-testid="hops-slider"
      />
    </Group>
  );
}
