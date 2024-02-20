import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

import { TriggerButton } from "./BucketPickerPopover/BaseBucketPickerPopover.styled";

export const StyledAccordionList = styled(AccordionList)<{ color: ColorName }>`
  color: ${props => color(props.color)};
`;

export const ItemName = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-grow: 1;
  white-space: nowrap;

  ${TriggerButton} {
    height: 100%;
    padding: 0;
    margin-left: 0.25rem;
  }
`;
