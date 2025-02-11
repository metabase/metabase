import styled from "@emotion/styled";

// TODO: figure out how to get rid of `as` prop
export const StyledAnchor = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;

  &:hover {
    color: var(--mb-color-text-dark);
  }
`;
