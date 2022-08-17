import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Link from "metabase/core/components/Link";

export const DashboardNavContainer = styled.div`
  padding: ${space(2)};
  width: 15rem;
  border-right: 1px solid ${color("border")};
  border-top: 1px solid ${color("border")};
  color: ${color("text-dark")};
  background-color: ${color("white")};
`;

const activeNavItem = `
  background-color: ${alpha("brand", 0.2)};
  color: ${color("brand")};
`;

export const DashboardNavItem = styled(Link)`
  display: block;
  margin-bottom: ${space(0)};
  padding: ${space(1)} ${space(2)};
  border-radius: ${space(0)};
  cursor: pointer;
  font-weight: 700;
  :hover {
    ${activeNavItem}
  }
  ${props => (props.active ? activeNavItem : "")}
`;

export const AppTitle = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: ${color("text-medium")};
  margin-bottom: ${space(2)};
`;
