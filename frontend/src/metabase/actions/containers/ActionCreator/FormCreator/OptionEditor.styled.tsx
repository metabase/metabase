// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const OptionEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: var(--mantine-spacing-md);
  gap: var(--mantine-spacing-sm);
`;

export const AddMorePrompt = styled.div<{ isVisible: boolean }>`
  text-align: center;
  font-size: 0.875rem;
  height: 1.25rem;
  color: var(--mb-color-text-tertiary);
  transition: opacity 0.2s ease-in-out;
  opacity: ${(props) => (props.isVisible ? 1 : 0)};
`;

export const ErrorMessage = styled.div`
  text-align: center;
  font-size: 0.875rem;
  color: var(--mb-color-error);
`;

export const TextArea = styled.textarea`
  resize: none;
  border: none;
  outline: 1px solid var(--mb-color-border);
  width: 20rem;
  border-radius: var(--mantine-spacing-sm);
  padding: var(--mantine-spacing-sm);
`;
