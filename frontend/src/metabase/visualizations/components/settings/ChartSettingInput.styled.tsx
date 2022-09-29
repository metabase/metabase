import styled from "@emotion/styled";
import { css } from "@emotion/react";
import InputBlurChange from "metabase/components/InputBlurChange";

import { color } from "metabase/lib/colors";

export const ChartSettingInputStyle = css`
  font-size: 0.875rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  color: ${color("text-dark")};
  padding: 0.625rem 0.75rem;
  display: block;
  width: 100%;
  transition: border 0.3s;
  font-weight: 700;
`;

export const ChartSettingInputBlueChange = styled(InputBlurChange)`
  ${ChartSettingInputStyle}
`;
