// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  /* Prevent the browser from selecting / highlighting the chart container
     on long-press. Without this the browser claims the gesture for element
     selection and swallows subsequent pointer events, blocking brush. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  /* zrender sets touch-action: none on the SVG which blocks all native
     scrolling. We override with pan-y so vertical page scroll works on
     touch devices while horizontal drags stay available for brush selection
     (gated behind a long-press, see useTouchBrush). */
  & svg {
    user-select: none !important;
    -webkit-touch-callout: none !important;
    touch-action: pan-y !important;
  }
`;
