import styled from "styled-components";

import { breakpointMaxMedium } from "metabase/styled-components/theme";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

export const GAP_REM = 1.15;

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${GAP_REM}rem;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: ${GAP_REM}rem;

  ${breakpointMaxMedium} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const SectionHeader = styled.div`
  padding-bottom: 1.15rem;
`;

export const FullHeightPinDropTarget = styled<{
  isBackTarget?: boolean;
  isFrontTarget?: boolean;
  itemModel: string;
  pinIndex?: number | null;
  enableDropTargetBackground?: boolean;
}>(PinDropTarget)`
  position: absolute !important;
  top: 0;
  bottom: 0;
  left: -${(GAP_REM * 5) / 8}rem;
  right: -${(GAP_REM * 5) / 8}rem;
  pointer-events: none;
  background-color: transparent;

  > * {
    pointer-events: all;
  }
`;
