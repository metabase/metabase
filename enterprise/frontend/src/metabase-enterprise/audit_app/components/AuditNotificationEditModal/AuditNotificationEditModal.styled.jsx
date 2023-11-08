import styled from "styled-components";
import Button from "metabase/components/Button";
import { space } from "metabase/styled-components/theme";

export const ModalButton = styled(Button)`
  margin-right: ${({ fullwidth }) => (fullwidth ? "auto" : "")};

  &:not(:first-child) {
    margin-left: ${space(2)};
  }
`;
