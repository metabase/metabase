import styled from "@emotion/styled";

import BaseSelectList from "metabase/components/SelectList";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { Button, type ButtonProps, Icon } from "metabase/ui";

export const TriggerIcon = styled(Icon)`
  color: var(--mb-color-text-white) !important;
  flex: 0 0 auto;
`;

export const ChevronDown = styled(Icon)`
  flex: 0 0 auto;
  width: 8px;
  margin-left: 0.25em;
  color: currentColor;
  opacity: 0.75;
`;

export const TriggerButton = styled(Button)<ButtonProps>`
  border-radius: 0;

  /** we hide the trigger button by default, and show it on hover */
  visibility: hidden;
  color: color-mix(in srgb, var(--mb-color-text-white), transparent 40%);
  border-left: 2px solid
    color-mix(in srgb, var(--mb-color-border), transparent 80%);
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

export const MoreButton = styled(Button)<ButtonProps>`
  transition: none !important;

  &:hover {
    background-color: var(--mb-color-brand-lighter);
  }
`;
