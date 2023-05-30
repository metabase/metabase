import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { AccordionList } from "metabase/core/components/AccordionList";

export const SelectAccordionList = styled(AccordionList)`
  color: ${color("brand")};
  outline: none;
`;
