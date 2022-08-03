import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ShowTotalsOptionRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
`;

export const SortOrderOptionRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
`;

export const FormattingOptionsRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
`;

export const ExpandIconContainer = styled.span`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
