import styled from "styled-components";
import { color } from "metabase/lib/colors";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";

export const AddAggregationButtonRoot = forwardRefToInnerRef(styled.button`
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
`);
