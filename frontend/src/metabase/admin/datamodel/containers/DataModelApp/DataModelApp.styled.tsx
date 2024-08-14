import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const NavBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  border-bottom: 1px solid var(--mb-color-border);
`;

export const ModelEducationButton = styled(Button)`
  color: var(--mb-color-text-dark);
`;

ModelEducationButton.defaultProps = {
  icon: "model",
  borderless: true,
};
