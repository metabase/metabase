import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

import { color } from "metabase/lib/colors";

export const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  padding: 0.5rem 1rem;
`;

export const NavItemsList = styled.ul`
  display: flex;
  flex-direction: row;
  gap: 6px;
`;

export const ActionPanelContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const ExitAppLink = styled(Link)`
  margin-left: 1rem;
`;
