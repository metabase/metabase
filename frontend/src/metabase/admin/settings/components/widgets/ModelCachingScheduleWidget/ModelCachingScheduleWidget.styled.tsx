import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";

import { color } from "metabase/ui/utils/colors";

import SettingSelect from "../SettingSelect";

export const Root = styled.div`
  display: flex;
  flex-direction: column;
`;

export const WidgetsRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: 1.3rem;
`;

export const WidgetContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 75.5px;
`;

export const StyledSettingSelect = styled(SettingSelect)`
  width: 125px;
  min-height: 45.5px; // should match SettingInput height
  margin-top: 12px;
`;

export const getCommonLabelStyle = (theme: Theme) => css`
  display: block;
  color: ${theme.fn.themeColor("text-medium")};
`;

export const SelectLabel = styled.span`
  ${({ theme }) => getCommonLabelStyle(theme)}
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 0.875rem;

  margin-top: 4px;
`;

export const Description = styled.span`
  margin-top: 1.5rem;
  color: ${color("text-medium")};
`;
