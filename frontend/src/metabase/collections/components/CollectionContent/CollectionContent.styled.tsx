import styled from "@emotion/styled";

export const CollectionRoot = styled.div`
  height: 100%;
  overflow: hidden;
  position: relative;
  container-name: ItemsTableContainer;
  container-type: inline-size;
  // NOTE: The BulkActionsToast is centered within this container.
  // If this div ever ceases to be a container one day, let's restore the previously
  // existing margin-left fix for the toast so it is still centered when the nav sidebar is open
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
`;

export const CollectionEmptyContent = styled.div`
  margin-top: calc(20vh - 3.5rem);
`;
