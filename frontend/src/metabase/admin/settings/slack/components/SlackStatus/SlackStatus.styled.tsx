import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StatusHeader = styled.header`
  display: flex;
  align-items: center;
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

export const StatusFooter = styled.footer``;
