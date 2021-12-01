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
  padding: 1.125rem 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.125rem;
`;

export const XrayIconContainer = styled.span`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 1.5rem;
  border-radius: 0.125rem;
  background-color: ${color("accent4")};
`;

export const XrayIcon = styled(Icon)`
  display: block;
  color: ${color("white")};
`;

export const XrayTitle = styled.span`
  display: block;
  color: ${color("text-medium")};
`;
