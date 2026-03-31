// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  /* zrender adds user-select: none to the root svg element which prevents
     users from selecting text on charts. Only restore on desktop — on touch
     devices it causes unwanted text selection during gestures. */
  @media (hover: hover) {
    & svg {
      user-select: auto !important;
    }
  }

  /* zrender sets touch-action: none on the SVG which blocks all native
     scrolling on touch devices. We override with auto so the browser handles
     scroll in all directions. Brush selection is gated behind a long-press
     that calls preventDefault on touchmove to reclaim the gesture (see useBrush). */
  @media (hover: none) {
    & svg {
      touch-action: auto !important;
    }
  }
`;
