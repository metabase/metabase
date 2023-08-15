import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SearchFilterWrapper = styled.div`
  & > * {
    border-bottom: 1px solid ${color("border")};
    padding: 1.5rem 2rem;
    margin: 0;
  }
`;
