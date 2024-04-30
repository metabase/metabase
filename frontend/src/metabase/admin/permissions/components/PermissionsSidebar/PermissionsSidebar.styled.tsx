import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const SidebarRoot = styled.aside`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  width: 300px;
  border-right: 1px solid ${color("border")};
`;

export const SidebarHeader = styled.div`
  padding: 0.75rem 1.5rem 0 1.5rem;
  flex-shrink: 0;
`;

export const BackIcon = styled(Icon)`
  margin-right: 0.5rem;
  color: ${color("text-light")};
`;

export const BackButton = styled.button`
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  font-family: var(--mb-default-font-family);
  font-weight: 700;
  font-size: 14px;
  padding: 0.5rem 0;
  cursor: pointer;
  transition: color 200ms;
  text-align: left;

  &:hover {
    color: ${color("filter")};
  }
`;
