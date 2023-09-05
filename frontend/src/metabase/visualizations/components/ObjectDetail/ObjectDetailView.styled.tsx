import styled from "@emotion/styled";

interface ObjectDetailContainerProps {
  wide: boolean;
}

export const ObjectDetailContainer = styled.div<ObjectDetailContainerProps>`
  overflow-y: auto;
  height: 100%;
`;
export const ObjectDetailWrapperDiv = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const ObjectDetailsTable = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 2rem;
`;

export const ErrorWrapper = styled.div`
  height: 480px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

type GridContainerProps = { cols?: number };

export const GridContainer = styled.div<GridContainerProps>`
  display: grid;
  grid-template-columns: repeat(${props => props.cols || 2}, minmax(0, 1fr));
  gap: 1rem;
`;

export interface GridItemProps {
  colSpan?: number;
}

export const GridCell = styled.div<GridItemProps>`
  grid-column: span ${props => props.colSpan || 1} / span
    ${props => props.colSpan || 1};
`;

export const FitImage = styled.img`
  max-width: 100%;
  max-height: 18rem;
  object-fit: contain;
  margin: 1rem auto;
`;
