// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Link } from "metabase/common/components/Link";
import { alpha, darken } from "metabase/lib/colors";
import {
  breakpointMaxLarge,
  breakpointMaxMedium,
} from "metabase/styled-components/theme";
import { color } from "metabase/ui/utils/colors";

import { ADMIN_NAVBAR_HEIGHT } from "../../constants";

export const AdminNavbarRoot = styled.nav`
  --mb-color-text-primary-inverse: var(--mantine-color-white);

  padding: 0.5rem 1rem;
  background: ${() => color("admin-navbar")};
  color: var(--mb-color-text-primary-inverse);
  font-size: 0.85rem;
  height: ${ADMIN_NAVBAR_HEIGHT};
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 4;
  flex-shrink: 0;
`;

export const AdminNavbarItems = styled.ul`
  display: flex;
  flex-grow: 0;
  min-width: 0;
  gap: 4px;
`;

export const MobileHide = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  flex-grow: 1;
  padding-inline-start: 2rem;
  ${breakpointMaxMedium} {
    display: none;
  }
`;

export const AdminMobileNavbar = styled.div`
  ${breakpointMaxMedium} {
    display: block;
  }

  display: none;
`;

export const AdminMobileNavBarItems = styled.ul`
  display: flex;
  position: fixed;
  flex-direction: column;
  text-align: right;
  padding: 1rem;
  gap: 2rem;
  border-radius: 0 0 0 0.5rem;
  top: ${ADMIN_NAVBAR_HEIGHT};
  right: 0;
  background: ${() => color("admin-navbar")};
  max-height: calc(100vh - ${ADMIN_NAVBAR_HEIGHT});
  overflow-y: auto;
`;

export const AdminButtons = styled.div`
  margin-inline-start: auto;
  display: flex;
  gap: 0.5rem;
`;

export const AdminActionButton = styled.button`
  border: 1px solid ${() => alpha("background-primary", 0.2)};
  height: 2.625rem;
  width: 2.625rem;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 5px;
  font-weight: 700;
  font-size: 13px;
  transition: all 200ms;
  color: var(--mb-color-text-primary-inverse);
  white-space: nowrap;
  text-align: center;

  &:disabled {
    color: ${() => alpha("background-primary", 0.2)};
  }

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => darken("admin-navbar")};
    border-color: ${() => darken("admin-navbar")};

    &:disabled {
      color: ${() => alpha("background-primary", 0.2)};
    }
  }
`;

export const AdminExitLink = styled(Link)`
  border: 1px solid ${() => alpha("background-primary", 0.2)};
  padding: 12px 18px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 13px;
  transition: all 200ms;
  color: var(--mb-color-text-primary-inverse);
  white-space: nowrap;
  text-align: center;

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => darken("admin-navbar")};
    border-color: ${() => darken("admin-navbar")};
  }
`;

export const AdminLogoContainer = styled.div`
  display: flex;
  min-width: 32px;
  max-width: 20rem;
  overflow: hidden;
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
`;
