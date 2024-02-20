import styled from "@emotion/styled";

import Triggerable from "metabase/components/Triggerable";
import Button from "metabase/core/components/Button";
import SelectButton from "metabase/core/components/SelectButton";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { ChartSettingColorPicker } from "./ChartSettingColorPicker";

interface ChartSettingFieldPickerRootProps {
  disabled: boolean;
}

export const ChartSettingFieldPickerRoot = styled.div<ChartSettingFieldPickerRootProps>`
  display: flex;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding-right: 1rem;
  padding-left: 0.5rem;
  background: ${color("white")};

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
    color: ${color("text-dark")};
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
    color: ${color("text-dark")};
  }

  ${SelectButton.Root}:disabled {
    background-color: ${color("white")};
  }
`;

interface SettingsIconProps {
  noPointer?: boolean;
  noMargin?: boolean;
}

export const SettingsButton = styled(Button)<SettingsIconProps>`
  margin-left: ${props => (props.noMargin ? "0" : "0.75rem")};
  padding: 0;

  &:hover {
    background-color: unset;
  }
`;

export const SettingsIcon = styled(Icon)<SettingsIconProps>`
  margin-left: ${props => (props.noMargin ? "0" : "0.75rem")};
  color: ${color("text-medium")};
  cursor: ${props => (props.noPointer ? "inherit" : "pointer")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const FieldPickerColorPicker = styled(ChartSettingColorPicker)`
  margin-bottom: 0;
  margin-left: 0.25rem;
`;
