import styled from "@emotion/styled";
import { Link } from "react-router";

export const BackButtonLink = styled(Link)`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  border-radius: 99px;
  color: var(--mb-color-text-white);
  background-color: var(--mb-color-bg-dark);

  &:hover {
    background-color: var(--mb-color-brand);
  }
`;
