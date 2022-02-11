import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ModalBody = styled.div`
  padding: 2rem;
`;

export const ModalButton = styled(Button)`
  color: ${color("danger")};
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: ${color("danger")};
    background-color: transparent;
  }
`;
