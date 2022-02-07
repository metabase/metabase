import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const AddAggregationButtonRoot = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem;
  transition: all 0.2s linear;
  color: ${color("accent1")};
  background-color: ${color("bg-light")};
  border-radius: 8px;
  font-weight: 700;
  min-height: 34px;
  min-width: 34px;
  cursor: pointer;

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;
