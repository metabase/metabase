import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const SidebarRoot = styled.aside`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  width: 300px;
  border-right: 1px solid ${color("border")};
`;

export const SidebarHeader = styled.div`
  flex-shrink: 0;
  padding: 1rem;
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarContent = styled.div`
  flex-grow: 1;
  padding: 1rem 0;
  overflow: auto;
`;

export const EntityGroupsDivider = styled.hr`
  margin: 1rem 1.5rem;
  border: 0;
  border-top: 1px solid ${color("border")};
`;

export const BackIcon = styled(Icon)`
  margin-right: 0.5rem;
  color: ${color("text-light")};
`;

BackIcon.defaultProps = { name: "arrow_left" };

export const BackButton = styled.button`
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  font-family: var(--default-font-family);
  font-weight: 700;
  font-size: 14px;
  padding: 0.5rem;
  cursor: pointer;
  transition: color 200ms;

  &:hover {
    color: ${color("accent7")};
  }
`;
