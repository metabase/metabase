import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const RevertButton = styled(Button)`
  padding: 0;
  border: none;
  color: ${color("text-dark")};
  position: relative;
  top: 2px;

  &:hover {
    background-color: transparent;
    color: ${color("accent3")};
  }
`;

export const RevisionTitleContainer = styled.span`
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: start;
`;
