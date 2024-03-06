import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

export const CollapsibleSectionContent = styled.div`
  display: inline-block;
  margin-left: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
