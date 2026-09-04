// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  /* Chart geometry is computed in physical pixels (axis margins, tick offsets,
   * label gutters), but SVG text-anchor start/end resolves against the
   * writing direction — so under dir="rtl" labels anchored with end extend
   * the wrong way and land on top of the plot. Pin the rendering surface to LTR;
   * bidi still shapes each text run, so Arabic/Hebrew labels read correctly. */
  & svg,
  & canvas {
    direction: ltr;
  }
  /* HACK: zrender adds user-select: none to the root svg element which prevents users from selecting text on charts */
  @media (hover: hover) {
    & svg {
      user-select: auto !important;
    }
  }

  /* zrender sets touch-action: none on the SVG which blocks all native
     scrolling on touch devices. We override with auto so the browser handles
     scroll in all directions. Brush selection is gated behind a long-press
     that calls preventDefault on touchmove to reclaim the gesture (see useBrush). */
  @media (hover: none) and (pointer: coarse) {
    & svg {
      touch-action: auto !important;
    }
  }
`;
