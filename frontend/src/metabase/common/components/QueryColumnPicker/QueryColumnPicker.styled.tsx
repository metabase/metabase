import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

import { TriggerButton } from "./BucketPickerPopover/BaseBucketPickerPopover.styled";

export const StyledAccordionList = styled(AccordionList)<{ color: ColorName }>`
  color: ${props => color(props.color)};
`;

export const ColumnNameContainer = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  flex-grow: 1;

  ${TriggerButton} {
    height: 100%;
    flex-shrink: 1;
    margin: -0.5rem 0;
    white-space: nowrap;
    overflow: hidden;
    margin-left: auto;
  }
`;
