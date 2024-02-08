import styled from "@emotion/styled";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export const StyledAccordionList = styled(AccordionList)`
  color: ${color("filter")};
  min-width: ${MIN_WIDTH}px;
  max-width: ${MAX_WIDTH}px;
`;

export const PopoverTarget = styled(Icon)`
  padding: 0.65em 0.5em;
  position: absolute;
  right: 0.65em;
  opacity: 0;
  cursor: pointer;

  [role="option"]:hover & {
    opacity: 1;
  }
`;
