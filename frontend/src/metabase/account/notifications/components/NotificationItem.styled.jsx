import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Link from "metabase/components/Link";

export const NotificationItemRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 6px;
  background-color: ${color("white")};

  &:not(:last-child) {
    margin-bottom: 1.25rem;
  }
`;

export const NotificationContent = styled.div`
  flex: 1 1 auto;
`;

export const NotificationTitle = styled(Link)`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export const NotificationDescription = styled.div`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  line-height: 0.875rem;
  margin-top: 0.25rem;
`;
