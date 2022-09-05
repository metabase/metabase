import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const AuditContentRoot = styled.div`
  flex: 1 0 auto;
  flex-direction: column;
  padding-bottom: 2rem;
`;

export const AuditContentHeading = styled.div`
  padding: 2rem 2rem 0 2rem;
`;

export const AuditContentTabs = styled.div`
  border-bottom: 1px solid ${color("border")};
  padding: 0 2rem;
  margin-top: 0.5rem;
`;

export const AuditContentData = styled.div`
  height: 100%;
  padding: 0 2rem;
`;
