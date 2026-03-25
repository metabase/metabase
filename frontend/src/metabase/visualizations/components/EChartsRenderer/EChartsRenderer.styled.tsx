// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  /* zrender sets touch-action: none on the SVG which blocks all native
     scrolling. We override with auto so the browser handles scroll in all
     directions. Brush selection is gated behind a long-press that calls
     preventDefault on touchmove to reclaim the gesture (see useBrush). */
  & svg {
    touch-action: auto !important;
  }
`;
