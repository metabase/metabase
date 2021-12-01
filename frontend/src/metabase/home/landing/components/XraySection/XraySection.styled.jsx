import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const TableGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
`;

export const XrayCardRoot = styled(Link)`
  display: flex;
  align-items: center;
  padding: 1.125rem 1.5rem;
  color: ${color("text-medium")};
  border: 1px solid ${color("border")};
  border-radius: 0.125rem;
  background-color: ${color("white")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const XrayIconContainer = styled.span`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  padding: 0.625rem;
  border-radius: 0.125rem;
  background-color: ${color("accent4")};
`;

export const XrayIcon = styled(Icon)`
  display: block;
  color: ${color("white")};
  width: 1.25rem;
  height: 1.25rem;
`;

export const XrayTitle = styled.span`
  display: block;
  margin-left: 1.5rem;
`;
