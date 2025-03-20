import styled from "@emotion/styled";

export const FileInput = styled(
  (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} type={props.type ?? "file"} />
  ),
)`
  &::file-selector-button {
    padding: 0.75rem 1rem;
    margin-right: 1rem;
    border-radius: 4px;
    border: 1px solid var(--mb-color-border);
    background-color: var(--mb-color-bg-white);
    color: var(--mb-color-text-dark);
    transition: 200ms;
    cursor: pointer;
    font-family: var(--mb-default-font-family);
  }

  &::file-selector-button:hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-bg-light);
  }
`;
