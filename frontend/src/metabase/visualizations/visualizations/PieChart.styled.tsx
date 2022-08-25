import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

// style={{ pointerEvents: "none" }}
// dy={1}
// transform={`translate(${arc.centroid(slice)})`}
// textAnchor="middle"
// fontSize="0.2rem"
// fill="white"
// fontWeight="700"

export const Label = styled.text`
  pointer-events: none;
  text-anchor: middle;
  fill: ${color("white")};
  font-size: 0.25rem;
  font-weight: bold;
`;
