// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const ListRoot = styled.div`
  display: block;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  margin: 0 1rem;
  min-width: 0;
`;

export const CardTitle = styled.div`
  color: var(--mb-color-text-primary);
  font-size: 1rem;
  font-weight: bold;
  margin-bottom: 0.125rem;
  word-wrap: break-word;
`;

export const CardDescription = styled.div`
  color: var(--mb-color-text-secondary);
  font-size: 0.75rem;
  word-wrap: break-word;
`;

export const CardIcon = styled(Icon)`
  color: var(--mb-color-text-primary);
  width: 1rem;
  height: 1rem;
`;

export const CardIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 1rem;
`;

export const CardAside = styled.div`
  flex: 0 0 auto;
  color: var(--mb-color-text-primary);
  font-size: 0.75rem;
`;

interface CardProps {
  isSelected?: boolean;
}

const selectedStyles = css`
  background-color: var(--mb-color-brand);

  ${CardTitle}, ${CardDescription}, ${CardAside} {
    color: var(--mb-color-text-primary-inverse);
  }

  ${CardIcon} {
    color: var(--mb-color-brand);
  }

  ${CardIconContainer} {
    border-color: var(--mb-color-background-primary);
    background-color: var(--mb-color-background-primary);
  }
`;

export const CardRoot = styled.div<CardProps>`
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: 0.25rem;
  cursor: pointer;
  ${(props) => props.isSelected && selectedStyles}

  &:hover {
    ${selectedStyles}
  }

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;
