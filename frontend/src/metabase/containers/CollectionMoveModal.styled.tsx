import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ButtonContainer = styled.div`
  display: flex;
  margin-top: 1rem;
`;

export const LightButton = styled(Button)`
  height: fit-content;
  line-height: 1.5rem;
  padding: 0.5rem;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;
