// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const InputRoot = styled.label`
  display: flex;
`;

interface InputFieldProps {
  hasValue: boolean;
}

export const InputField = styled.input<InputFieldProps>`
  color: var(--mb-color-text-primary);
  flex: 1 1 auto;
  font-family: inherit;
  font-weight: ${(props) => (props.hasValue ? "bold" : "")};
  order: 1;

  &:active,
  &:focus {
    outline: none;
  }

  &::file-selector-button {
    padding-top: 0.5rem;
    padding-right: 2rem;
    visibility: hidden;
  }
`;

export const InputButton = styled.span`
  border: 1px solid var(--mb-color-border);
  border-radius: 6px;
  box-sizing: border-box;
  color: var(--mb-color-text-primary);
  cursor: pointer;
  display: inline-block;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: bold;
  padding: 0.5rem 0.75rem;
  white-space: nowrap;
  user-select: none;

  ${InputField}:focus + & {
    outline: 2px solid var(--mb-color-focus);
  }

  ${InputField}:not(:focus-visible) + & {
    outline: none;
  }
`;
