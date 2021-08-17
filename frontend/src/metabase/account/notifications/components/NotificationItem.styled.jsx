import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

export const NotificationItemRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border: 1px solid ${colors["border"]};
  border-radius: 6px;
  background-color: ${colors["white"]};
`;

export const NotificationContent = styled.div`
  flex: 1 1 auto;
`;

export const NotificationTitle = styled(Link)`
  color: ${colors["brand"]};
  cursor: pointer;
  font-weight: bold;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export const NotificationDescription = styled.div`
  color: ${colors["text-medium"]};
  font-size: 0.75rem;
  line-height: 0.875rem;
  margin-top: 0.25rem;
`;

export const NotificationIcon = styled(Icon)`
  color: ${colors["text-light"]};
  cursor: pointer;
  width: 1rem;
  height: 1rem;

  &:hover {
    color: ${colors["text-medium"]};
  }
`;
