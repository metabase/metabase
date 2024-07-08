import styled from "@emotion/styled";

export const CollectionRoot = styled.div`
  height: 100%;
  overflow: hidden;
  position: relative;
`;

export const CollectionMain = styled.div`
  margin: 0 auto;
  overflow-y: auto;
  max-height: 100%;
  padding: 1rem 5%;
`;

export interface CollectionTableProps {
  hasPinnedItems?: boolean;
}

export const CollectionTable = styled.div<CollectionTableProps>`
  margin-top: ${props => (props.hasPinnedItems ? "2rem" : "")};
  container-name: ItemsTableContainer;
  container-type: inline-size;
`;

export const CollectionEmptyContent = styled.div`
  margin-top: calc(20vh - 3.5rem);
`;
