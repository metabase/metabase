import styled from "styled-components";
import Link from "metabase/components/Link";
import { alpha, color, darken } from "metabase/lib/colors";
import { breakpointMaxLarge } from "metabase/styled-components/theme";

export const AdminNavbarRoot = styled.nav`
  padding: 0.5rem;
  background: ${color("admin-navbar")};
  color: ${color("white")};
  font-size: 0.85rem;
  height: 65px;
  display: flex;
  align-items: center;
`;

export const AdminNavbarItems = styled.ul`
  display: flex;
  flex: 1 0 auto;
  margin-right: auto;
  margin-left: 2rem;
`;

export const AdminExitLink = styled(Link)`
  margin-right: 16px;
  border: 1px solid ${alpha("white", 0.2)};
  padding: 12px 18px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 13px;
  transition: all 200ms;
  color: ${color("white")};
  white-space: nowrap;

  &:hover {
    color: ${color("white")};
    background-color: ${darken(color("accent7"))};
    border-color: ${darken(color("accent7"))};
  }
`;

export const AdminLogoContainer = styled.div`
  display: flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
`;

export const AdminLogoText = styled.div`
  margin-left: 1rem;
  font-weight: 700;

  ${breakpointMaxLarge} {
    display: none;
  }
`;

export const AdminLogoLink = styled(Link)`
  cursor: pointer;
  display: flex;
  justify-content: center;
  margin-left: 1rem;
`;
