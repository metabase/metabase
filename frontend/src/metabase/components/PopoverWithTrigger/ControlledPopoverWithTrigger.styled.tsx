import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { ButtonContent } from "metabase/core/components/Button/Button.styled";

export const TriggerButton = styled(Button)`
  padding: 0;
  border: none;

  &:hover {
    background: unset;
  }

  ${ButtonContent} {
    display: block;
  }
`;
