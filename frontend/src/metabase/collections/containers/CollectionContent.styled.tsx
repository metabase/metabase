import styled from "@emotion/styled";

export const CollectionRoot = styled.div`
  padding-top: 1rem;
`;

export const CollectionMain = styled.div`
  margin: 0 auto;
  width: 90%;
`;

export interface CollectionTableProps {
  hasPinnedItems?: boolean;
}

export const CollectionTable = styled.div<CollectionTableProps>`
  margin-top: ${props => (props.hasPinnedItems ? "2rem" : "")};
`;

export const CollectionEmptyContent = styled.div`
  margin-top: calc(20vh - 3.5rem);
`;
