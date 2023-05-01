import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import BaseSelectList from "metabase/components/SelectList";
import { alpha, color } from "metabase/lib/colors";

export const TriggerIcon = styled(Icon)`
  color: ${color("white")} !important;
`;

export const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  color: ${alpha(color("white"), 0.5)};
  font-weight: 700;
  border-left: 2px solid ${alpha(color("border"), 0.1)};
  padding: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
  }
`;

export const SelectListItem = styled(BaseSelectList.Item)`
  padding: 0.5rem 1rem;
  font-weight: 400;

  &[aria-selected="true"] {
    background-color: ${color("summarize")};
  }

  &:hover {
    background-color: ${color("summarize")};
  }
`;

export const SelectList = styled(BaseSelectList)`
  overflow-y: auto;
  padding: 0.5rem 1rem;

  ${SelectListItem} {
    margin: 2px 0;
  }
`;
