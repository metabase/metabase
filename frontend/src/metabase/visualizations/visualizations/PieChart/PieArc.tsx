import type d3 from "d3";
import type { SVGAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { getTextColorForBackground } from "metabase/lib/colors";

import { Label } from "./PieArc.styled";
import { getMaxLabelDimension } from "./utils";

const LABEL_PADDING = 4;

interface PieArcProps extends SVGAttributes<SVGPathElement> {
  d3Arc: d3.svg.Arc<d3.svg.arc.Arc>;
  slice: d3.svg.arc.Arc;
  label?: string;
  labelFontSize: number;
  shouldRenderLabel?: boolean;
}

export const PieArc = ({
  d3Arc,
  slice,
  label,
  labelFontSize,
  shouldRenderLabel,
  ...rest
}: PieArcProps) => {
  const [isLabelVisible, setIsLabelVisible] = useState(false);
  const labelRef = useRef<SVGTextElement>(null);
  const labelTransform = `translate(${d3Arc.centroid(slice)})`;

  useEffect(() => {
    if (!shouldRenderLabel) {
      return;
    }
    const maxDimension = getMaxLabelDimension(d3Arc, slice);
    const dimensions = labelRef.current?.getBoundingClientRect();

    if (!dimensions) {
      return;
    }

    const isLabelVisible =
      dimensions.width + LABEL_PADDING <= maxDimension &&
      dimensions.height + LABEL_PADDING <= maxDimension;

    setIsLabelVisible(isLabelVisible);
  }, [d3Arc, shouldRenderLabel, slice]);

  const labelColor = rest.fill && getTextColorForBackground(rest.fill);

  return (
    <>
      <path data-testid="slice" d={d3Arc(slice)} {...rest} />
      {shouldRenderLabel && label != null && (
        <Label
          style={{ visibility: isLabelVisible ? "visible" : "hidden" }}
          fontSize={labelFontSize}
          ref={labelRef}
          dy={4}
          transform={labelTransform}
          fill={labelColor}
        >
          {label}
        </Label>
      )}
    </>
  );
};
