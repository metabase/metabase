import styled from "@emotion/styled";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export const StyledAccordionList = styled(AccordionList)`
  color: ${color("filter")};
  min-width: ${MIN_WIDTH}px;
  max-width: ${MAX_WIDTH}px;
`;
