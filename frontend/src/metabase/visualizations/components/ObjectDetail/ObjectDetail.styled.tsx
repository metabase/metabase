import styled from "@emotion/styled";
import { breakpointMinMedium } from "metabase/styled-components/theme/media-queries";
import { color } from "metabase/lib/colors";

interface ObjectDetailModalProps {
  wide: boolean;
}

export const ObjectDetailModal = styled.div<ObjectDetailModalProps>`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  overflow: hidden;
  ${breakpointMinMedium} {
    width: ${({ wide }) => (wide ? "64rem" : "48rem")};
    max-width: 95vw;
  }
  max-height: 95vh;
  width: 95vw;
`;

export const ObjectDetailBodyWrapper = styled.div`
  font-size: 1rem;
  overflow-y: auto;
  ${breakpointMinMedium} {
    display: flex;
    height: calc(80vh - 4rem);
  }
  height: calc(100vh - 8rem);
`;

export const ObjectIdLabel = styled.span`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
`;

export const ObjectDetailsTable = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 2rem;
  ${breakpointMinMedium} {
    max-height: calc(80vh - 4rem);
  }
`;

export const ObjectRelationships = styled.div`
  overflow-y: auto;
  flex: 0 0 100%;
  padding: 2rem;
  background-color: ${color("bg-light")};
  ${breakpointMinMedium} {
    flex: 0 0 33.3333%;
    max-height: calc(80vh - 4rem);
  }
`;

export const CloseButton = styled.div`
  display: flex;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid ${color("border")};
  ${breakpointMinMedium} {
    display: none;
  }
`;

export const ErrorWrapper = styled.div`
  height: 480px;
`;

type GridContainerProps = { cols?: number };

export const GridContainer = styled.div<GridContainerProps>`
  display: grid;
  grid-template-columns: repeat(${props => props.cols || 2}, minmax(0, 1fr));
  gap: 1rem;
`;

type GridItemProps = { colSpan?: number };

export const GridCell = styled.div<GridItemProps>`
  grid-column: span ${props => props.colSpan || 1} / span
    ${props => props.colSpan || 1};
`;
