import styled from "@emotion/styled";
import Modal from "metabase/components/Modal";
import { breakpointMinMedium } from "metabase/styled-components/theme/media-queries";
import { color } from "metabase/lib/colors";

interface ObjectDetailModalProps {
  wide: boolean;
}

export const CenteredLayout = styled.div`
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
`;

export const ObjectDetailModal = styled.div<ObjectDetailModalProps>`
  overflow-y: scroll;
  height: 100%;
`;

export const ObjectDetailBodyWrapper = styled.div`
  font-size: 1rem;
  overflow-y: auto;
`;

export const ObjectIdLabel = styled.span`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
`;

export const ObjectDetailsTable = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 2rem;
`;

export const ObjectRelationships = styled.div`
  overflow-y: auto;
  flex: 0 0 100%;
  padding: 2rem;
  background-color: ${color("bg-light")};
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

export interface GridItemProps {
  colSpan?: number;
}

export const GridCell = styled.div<GridItemProps>`
  grid-column: span ${props => props.colSpan || 1} / span
    ${props => props.colSpan || 1};
`;

export const RootModal = styled(Modal)`
  ${ObjectDetailModal} {
    overflow: hidden;
    ${breakpointMinMedium} {
      width: ${({ wide }) => (wide ? "64rem" : "48rem")};
      max-width: 95vw;
    }
    max-height: 95vh;
    width: 95vw;

    border: 1px solid ${color("border")};
    border-radius: 0.5rem;
  }

  ${ObjectDetailBodyWrapper} {
    ${breakpointMinMedium} {
      display: flex;
      height: calc(80vh - 4rem);
    }
    height: calc(100vh - 8rem);
  }

  ${ObjectDetailsTable} {
    ${breakpointMinMedium} {
      max-height: calc(80vh - 4rem);
    }
  }

  ${ObjectRelationships} {
    ${breakpointMinMedium} {
      flex: 0 0 33.3333%;
      max-height: calc(80vh - 4rem);
    }
  }
`;

export interface ObjectRelationshipContentProps {
  isClickable: boolean;
}

export const ObjectRelationContent = styled.div<ObjectRelationshipContentProps>`
  display: flex;
  align-items: center;
  margin: 1rem 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${color("border")};
  color: ${props => color(props.isClickable ? "text-dark" : "text-medium")};
  cursor: ${props => props.isClickable && "pointer"};

  &:hover {
    color: ${props => props.isClickable && color("brand")};
  }
`;
