import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import SelectButton from "metabase/core/components/SelectButton";

export const ChartSettingFieldPickerRoot = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding-right: 1rem;

  ${SelectButton.Root} {
    border: none;
    padding: 0.75rem;
  }

  ${SelectButton.Icon} {
    margin-left: 0;
    color: ${color("text-dark")};
    height: 0.625rem;
  }

  ${SelectButton.Content} {
    font-size: 0.875rem;
    line-height: 1rem;
    margin-right: 0.25rem;
  }
`;

export const SettingsIcon = styled(Icon)`
  margin-left: 0.5rem;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
