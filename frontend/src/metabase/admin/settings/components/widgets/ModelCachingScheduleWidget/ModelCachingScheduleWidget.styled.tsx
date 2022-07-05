import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import SettingSelect from "../SettingSelect";

export const Root = styled.div`
  display: flex;
  flex-direction: row;
  gap: 1.3rem;
`;

export const WidgetContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 75.5px;
`;

export const StyledSettingSelect = styled(SettingSelect)`
  width: 125px;
  min-height: 45.5px; // should match SettingInput height
`;

const commonLabelStyle = css`
  display: block;
  color: ${color("text-medium")};
`;

export const SelectLabel = styled.span`
  ${commonLabelStyle}
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 0.875rem;

  margin-top: 4px;
`;

export const CustomScheduleLabel = styled.span`
  ${commonLabelStyle}
  color: ${color("text-medium")};
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5rem;

  margin-bottom: 6px;
`;

export const ErrorMessage = styled.span`
  color: ${color("error")};
  margin-top: 4px;
`;
