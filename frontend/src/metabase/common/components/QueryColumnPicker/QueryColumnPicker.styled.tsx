import styled from "@emotion/styled";

import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
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

  ${TriggerButton} {
    height: 100%;
    padding: 0;
    flex-shrink: 1;
    white-space: nowrap;
    overflow: hidden;
  }
`;

export const ColumnInfoIcon = styled(QueryColumnInfoIcon)`
  align-self: center;
`;
