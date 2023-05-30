import styled from "@emotion/styled";
import { Button } from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ModalButton = styled(Button)`
  margin-right: ${({ fullwidth }) => (fullwidth ? "auto" : "")};

  &:not(:first-of-type) {
    margin-left: ${space(2)};
  }
`;

export const ModalErrorMessage = styled.div`
  color: ${color("error")};
  margin-top: 0.5rem;
`;
