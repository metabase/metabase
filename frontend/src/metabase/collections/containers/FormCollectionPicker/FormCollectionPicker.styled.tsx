import styled from "@emotion/styled";

import ItemPicker from "metabase/containers/ItemPicker";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const MIN_POPOVER_WIDTH = 300;

export const PopoverItemPicker = styled(ItemPicker)<{ width: number }>`
  width: ${({ width = MIN_POPOVER_WIDTH }) => width}px;
  padding: 1rem;
  overflow: auto;
`;

export const NewCollectionButton = styled(Button)`
  height: fit-content;
  line-height: 1.5rem;
  padding: 0.5rem;
  margin: 0 1rem 1rem;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;
