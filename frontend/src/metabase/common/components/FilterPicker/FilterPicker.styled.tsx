import styled from "@emotion/styled";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import { Flex } from "metabase/ui";

export const FlexWithScroll = styled(Flex)`
  overflow-y: auto;
`;

export const StyledAccordionList = styled(AccordionList)`
  color: ${color("filter")};
`;
