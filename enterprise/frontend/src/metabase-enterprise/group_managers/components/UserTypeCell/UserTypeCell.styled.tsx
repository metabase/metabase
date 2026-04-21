import styled from "@emotion/styled";

export const ChangeTypeButton = styled.button`
  padding: 0 0.25rem;
  color: var(--mb-color-filter);
  cursor: pointer;
  vertical-align: middle;
`;

export const UserTypeCellRoot = styled.td`
  text-transform: capitalize;
  font-size: 14px;
  font-weight: bold;
  color: var(--mb-color-text-secondary);

  ${ChangeTypeButton} {
    visibility: hidden;
  }

  &:hover {
    ${ChangeTypeButton} {
      visibility: visible;
    }
  }
`;
