import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";

import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export const StyledAccordionList = styled(AccordionList)`
  color: var(--mb-color-filter);
  min-width: ${MIN_WIDTH}px;
  max-width: ${MAX_WIDTH}px;
`;
