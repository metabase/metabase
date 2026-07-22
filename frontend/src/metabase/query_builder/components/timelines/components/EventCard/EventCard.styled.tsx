// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { alpha } from "metabase/ui/colors";

interface CardRootProps {
  isSelected?: boolean;
}

export const CardRoot = styled.div<CardRootProps>`
  display: flex;
  padding: 0.25rem 0.75rem;
  border-left: 0.25rem solid
    ${(props) =>
      props.isSelected ? "var(--mb-color-core-brand)" : "transparent"};
  background-color: ${(props) =>
    props.isSelected ? alpha("core-brand", 0.03) : "transparent"};
  cursor: pointer;

  &:hover {
    background-color: ${() => alpha("core-brand", 0.03)};
  }
`;

export const CardCheckboxContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  padding: 0.125rem 0.75rem 0 0.125rem;
  min-width: 0;
`;

export const CardAside = styled.div`
  flex: 0 0 auto;
  align-self: start;
`;
