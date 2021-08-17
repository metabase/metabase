import styled from "styled-components";
import colors from "metabase/lib/colors";

export const NotificationItemRoot = styled.div`
  padding: 1rem 1.5rem;
  border: 1px solid ${colors["border"]};
  border-radius: 6px;
  background-color: ${colors["white"]};
`;

export const NotificationDescription = styled.div`
  color: ${colors["text-medium"]};
  font-size: 0.75rem;
  line-height: 0.875rem;
`;
