import styled from "@emotion/styled";

import AccordionList from "metabase/core/components/AccordionList";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

import { TriggerButton } from "./BucketPickerPopover/BaseBucketPickerPopover.styled";

export const StyledAccordionList = styled(AccordionList)<{ color: ColorName }>`
  color: ${props => color(props.color)};
`;

export const NameAndBucketing = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;

  ${TriggerButton} {
    height: 100%;
    padding: 0;
    flex-shrink: 1;
  }
`;

export const ItemName = styled(Ellipsified)`
  margin-right: 0.25rem;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;
