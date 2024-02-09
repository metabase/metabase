import styled from "@emotion/styled";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import { FieldInfoIcon } from "metabase/components/MetadataInfo/FieldInfoIcon";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export const StyledAccordionList = styled(AccordionList)`
  color: ${color("filter")};
  min-width: ${MIN_WIDTH}px;
  max-width: ${MAX_WIDTH}px;

  ${FieldInfoIcon.HoverTarget} {
    padding: 0.65em 0.5em;
    position: absolute;
    right: 0.65em;
    cursor: pointer;
  }
  [role="option"]:hover ${FieldInfoIcon.HoverTarget} {
    opacity: 0.5;
  }
`;
