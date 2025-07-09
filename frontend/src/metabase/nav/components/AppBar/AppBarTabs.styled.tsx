// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { AppBarRoot as BaseAppBarRoot } from "./AppBarLarge.styled";

export const AppBarRoot = styled(BaseAppBarRoot)`
  // Inherit from base AppBar styles
`;

export const AppBarLeftContainer = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
`;

export const AppBarRightContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const AppBarInfoContainer = styled.div<{ isVisible: boolean }>`
  display: ${props => (props.isVisible ? "flex" : "none")};
  align-items: center;
  margin-left: 1rem;
  min-width: 0;
  flex: 1;
`;

export const AppBarProfileLinkContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const AppBarTabsContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: 2rem;
  margin-right: 1rem;
  gap: 0.5rem;
`;

export const TabButton = styled.button<{ isActive: boolean }>`
  background: ${props => props.isActive ? "var(--mb-color-brand)" : "transparent"};
  color: ${props => props.isActive ? "white" : "var(--mb-color-text-medium)"};
  border: none;
  font-weight: 600;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background: ${props => props.isActive ? "var(--mb-color-brand)" : "var(--mb-color-bg-light)"};
    color: ${props => props.isActive ? "white" : "var(--mb-color-text-dark)"};
  }
`;
