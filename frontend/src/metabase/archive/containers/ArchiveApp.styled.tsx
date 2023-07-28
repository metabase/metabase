import styled from "@emotion/styled";

export const ArchiveRoot = styled.div`
  margin: 0 4rem;
`;

export const ArchiveHeader = styled.div`
  margin-top: 1rem;
  padding: 1rem 0;
`;

export const ArchiveBody = styled.div`
  width: 66.66%;
  padding-bottom: 4rem;
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
