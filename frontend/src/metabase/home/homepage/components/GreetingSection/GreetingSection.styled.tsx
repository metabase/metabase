import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SectionRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const SectionMessage = styled.div`
  color: ${color("text-dark")};
  font-size: 1.125rem;
  font-weight: bold;
  line-height: 1.5rem;

  &:not(:first-child) {
    margin-left: 0.5rem;
  }
`;
