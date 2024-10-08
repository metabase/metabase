import styled from "@emotion/styled";

import Triggerable from "metabase/components/Triggerable";
import Button from "metabase/core/components/Button";
import SelectButton from "metabase/core/components/SelectButton";
import { Icon } from "metabase/ui";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

export const SettingsButton = styled(Button)`
  margin-left: 0.75rem;
  padding: 0;

  &:hover {
    background-color: unset;
  }
`;

export const GrabberHandle = styled(Icon)`
  color: var(--mb-color-text-medium);
  cursor: inherit;
`;

export const FieldPickerColorPicker = styled(ChartSettingColorPicker)`
  margin-bottom: 0;
  margin-left: 0.25rem;
`;

interface ChartSettingFieldPickerRootProps {
  disabled: boolean;
  showDragHandle: boolean;
}

export const ChartSettingFieldPickerRoot = styled.div<ChartSettingFieldPickerRootProps>`
  display: flex;
  align-items: center;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  padding-right: 1rem;
  padding-left: 0.5rem;
  background: var(--mb-color-bg-white);
  cursor: ${props => (props.showDragHandle ? "grab" : "default")};

  ${Triggerable.Trigger} {
    flex: 1;
    overflow: hidden;
  }

  ${SelectButton.Root} {
    border: none;
    padding: 0.75rem 0.5rem;
  }

  ${SelectButton.Icon} {
    margin-left: 0;
    color: var(--mb-color-text-dark);
    height: 0.625rem;
    ${props => props.disabled && "display: none;"}
    flex-shrink: 0;
  }

  ${SelectButton.Content} {
    font-size: 0.875rem;
    line-height: 1rem;
    margin-right: 0.25rem;
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: left;
    overflow: hidden;
    color: var(--mb-color-text-dark);
  }

  ${SelectButton.Root}:disabled {
    background-color: var(--mb-color-bg-white);
  }

  &:hover {
    ${GrabberHandle} {
      color: var(--mb-color-brand);
    }
  }
`;
