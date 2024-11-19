import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";

import { WIDTH } from "../constants";

export const StyledAccordionList = styled(AccordionList)`
  color: var(--mb-color-filter);
  width: ${WIDTH}px;
`;
