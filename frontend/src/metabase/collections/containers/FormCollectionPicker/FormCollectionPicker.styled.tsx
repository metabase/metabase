import styled from "@emotion/styled";

import ItemPicker from "metabase/containers/ItemPicker";
import Button from "metabase/core/components/Button";

export const MIN_POPOVER_WIDTH = 300;

export const PopoverItemPicker = styled(ItemPicker)<{ width: number }>`
  width: ${({ width = MIN_POPOVER_WIDTH }) => width}px;
  padding: 1rem;
  overflow: auto;
`;
export const NewCollectionButton = styled(Button)`
  margin-top: 0.5rem;
`;
