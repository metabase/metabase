import styled from "@emotion/styled";

import Card from "metabase/components/Card";

export const ArchiveRoot = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const ArchiveHeader = styled.div`
  margin-top: 1rem;
  padding: 1rem 4rem;
`;

export const ArchiveBody = styled.div`
  position: relative;
  height: 100%;
  overflow-y: auto;
`;

export const VirtualizedListWrapper = styled.div`
  padding: 0 4rem 4rem 4rem;
`;

export const CardWithMaxWidth = styled(Card)`
  max-width: 40rem;
`;

export const ArchiveBarContent = styled.div`
  align-items: center;
  display: flex;
  // Height is hard-set so it remains
  // the same as the ProfileLinkContainer
  // in MainNavbar
  height: 48px;
  padding: 8px 4rem 7px;
`;

export const ArchiveBarText = styled.div`
  margin-left: auto;
`;

export const ArchiveEmptyState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8rem;
`;
