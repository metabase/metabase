import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const ToggleRoot = styled.div`
  align-items: center;
  color: var(--mb-color-text-medium);
  display: flex;
  margin-left: auto;
  padding-right: 4px;
  min-height: 3rem;
`;

interface ToggleContentProps {
  isReadOnly?: boolean;
}

export const ToggleContent = styled.a<ToggleContentProps>`
  display: ${props => (props.isReadOnly ? "none" : "flex")};
  color: var(--mb-color-text-medium);
  font-size: 10px;
  font-weight: 700;
  text-decoration: none;
  text-transform: uppercase;
  align-items: center;
  margin-left: 1.5rem;
  margin-right: 1.5rem;
  transition: all 0.2s linear;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const ToggleText = styled.span`
  margin-right: ${space(1)};
  min-width: 70px;
`;
