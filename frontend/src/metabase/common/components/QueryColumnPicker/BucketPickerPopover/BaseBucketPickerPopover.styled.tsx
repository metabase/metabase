import styled from "@emotion/styled";

import BaseSelectList from "metabase/components/SelectList";
import Button from "metabase/core/components/Button";
import { alpha, color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { Icon } from "metabase/ui";

export const TriggerIcon = styled(Icon)`
  color: ${color("white")} !important;
  flex: 0 0 auto;
  margin-left: 0.5rem;
`;

export const ChevronDown = styled(Icon)`
  flex: 0 0 auto;
  width: 8px;
  margin-left: 0.25em;
  color: currentColor;
  opacity: 0.75;
`;

export const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  min-width: 0;
  color: ${alpha(color("white"), 0.5)};
  font-weight: 700;
  padding: 0.5rem;
  border-left: 2px solid ${alpha(color("border"), 0.1)};
  margin-left: auto;
  cursor: pointer;

  ${ChevronDown} {
    color: currentColor;
  }

  &:hover {
    color: ${color("white")};
  }
`;

export const Dot = styled.div`
  width: 3px;
  height: 3px;
  margin-right: 0.5em;
  background: currentColor;
  border-radius: 100%;
  opacity: 0.25;
`;

export const SelectListItem = styled(BaseSelectList.Item)<{
  activeColor: ColorName;
}>`
  padding: 0.5rem 1rem;
  font-weight: 400;

  &[aria-selected="true"] {
    background-color: ${props => color(props.activeColor)};
  }

  &:hover {
    background-color: ${props => color(props.activeColor)};
  }
`;

export const Content = styled.div`
  overflow-y: auto;
  padding: 0.5rem;
  min-width: 160px;

  ${SelectListItem} {
    margin: 2px 0;
  }
`;

export const MoreButton = styled(Button)`
  width: 100%;
  height: 36px;
  padding: 8px 16px;
  transition: none !important;

  ${Button.Content} {
    justify-content: flex-start;
  }

  &:hover {
    background-color: ${color("brand-lighter")};
  }
`;

MoreButton.defaultProps = { onlyText: true };
