import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import AccordionList from "metabase/core/components/AccordionList";

export const SelectAccordionList = styled(AccordionList)`
  color: ${color("brand")};
  outline: none;
`;
