import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const HostingCTARoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const HostingCTAContent = styled.div`
  display: flex;
`;

export const HostingCTAIconContainer = styled.div`
  display: flex;
  width: 3.25rem;
  height: 2rem;
`;

export const NewVersionContainer = styled.div`
  background-color: ${color("summarize")};
`;

export const OnLatestVersionMessage = styled.div`
  padding: 1rem;
  color: ${color("white")};
  font-weight: bold;
  border: 1px solid ${color("brand")};
  border-radius: 0.5rem;
  background-color: ${color("brand")};
`;
