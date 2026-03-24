// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  /* HACK: zrender adds user-select: none to the root svg element which prevents users from selecting text on charts */
  /* zrender also sets touch-action: none which blocks all native scrolling.
     We override with auto so the browser handles scroll in all directions.
     Brush selection is gated behind a long-press that calls preventDefault
     on touchmove to reclaim the gesture from the browser (see useBrush). */
  & svg {
    user-select: auto !important;
    touch-action: auto !important;
  }
`;
