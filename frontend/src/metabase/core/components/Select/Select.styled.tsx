import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";

export const SelectAccordionList = styled(AccordionList)`
  color: ${color("brand")};
  outline: none;
`;
