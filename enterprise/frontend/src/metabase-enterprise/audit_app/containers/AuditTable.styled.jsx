import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const PaginationControlsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid ${color("border")};
`;
