import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/SidebarContent";

export const DataReferenceContainer = styled.div`
  overflow: hidden;
  position: relative;
  height: 100%;
  background-color: ${color("white")};

  ${SidebarContent.Header.Root} {
    position: sticky;
    top: 0;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    margin: 0;
    background-color: ${color("white")};
  }
`;
