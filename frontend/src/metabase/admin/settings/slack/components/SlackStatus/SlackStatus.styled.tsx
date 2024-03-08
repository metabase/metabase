import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const StatusRoot = styled.div`
  max-width: 42rem;
  padding-left: 1rem;
`;

export const StatusHeader = styled.header`
  display: flex;
  align-items: center;
  margin-bottom: 2.5rem;
`;

export const StatusPrimary = styled.div`
  flex: 1 1 auto;
`;

export const StatusSecondary = styled.div`
  flex: 0 0 auto;
`;

export const StatusTitle = styled.h2`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
  line-height: 1.875rem;
  margin: 0;
`;

export const StatusMessage = styled.div`
  margin-top: 0.5rem;
`;

export const StatusMessageText = styled.span`
  color: ${color("text-medium")};
`;

export const StatusFooter = styled.footer`
  margin-top: 4rem;
`;
