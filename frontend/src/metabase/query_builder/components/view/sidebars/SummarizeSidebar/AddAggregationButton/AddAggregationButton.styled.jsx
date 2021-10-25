import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const AddAggregationButtonRoot = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: Lato, "Helvetica Neue", Helvetica, sans-serif;
  padding: 0.625rem;
  transition: all 0.2s linear;
  color: ${color("accent1")};
  background-color: ${color("bg-light")};
  border-radius: 8px;
  font-weight: 700;
  min-height: 34px;
  min-width: 34px;

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;
