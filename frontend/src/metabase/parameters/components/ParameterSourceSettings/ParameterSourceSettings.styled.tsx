import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const RadioLabelRoot = styled.span`
  display: flex;
`;

export const RadioLabelTitle = styled.span`
  flex: 1 1 auto;
`;

export const RadioLabelLink = styled.span`
  flex: 0 0 auto;
  color: ${color("text-dark")};
  margin-left: 1rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
