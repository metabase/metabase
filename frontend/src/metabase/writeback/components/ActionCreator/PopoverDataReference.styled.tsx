import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const DataReferencePopoverContainer = styled.div`
  width: 20rem;
  height: 30rem;
  overflow: auto;
  position: relative;

  .sidebar-header {
    position: sticky;
    top: 0;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    margin: 0;
    background-color: ${color("white")};
  }
`;
