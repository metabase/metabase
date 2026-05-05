// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/ui/utils/colors";

export const StepDescription = styled.div`
  color: var(--mb-color-text-secondary);
  margin: 0.875rem 0;
`;

export const LocaleGroup = styled.ol`
  margin-bottom: 2rem;
  padding: 0.5rem;
  max-height: 17.5rem;
  overflow-y: scroll;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.25rem;
`;

export const LocaleLabel = styled.label`
  display: block;
`;

export const LocaleInput = styled.input`
  appearance: none;
  display: block;
  margin: 0;
  padding: 0;
`;

interface LocaleContainerProps {
  checked: boolean;
}

export const LocaleButton = styled.span<LocaleContainerProps>`
  display: block;
  padding: 0.5rem;
  color: ${(props) =>
    color(props.checked ? "text-primary-inverse" : "text-primary")};
  border-radius: 0.25rem;
  background-color: ${(props) =>
    props.checked ? color("brand") : color("background-primary")};
  font-weight: 700;
  border: 2px solid var(--mb-color-white);

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: var(--mb-color-brand);
  }

  ${LocaleInput}:focus + & {
    outline: 2px solid var(--mb-color-brand);
  }

  ${LocaleInput}:focus:not(:focus-visible) + & {
    outline: none;
  }
`;
