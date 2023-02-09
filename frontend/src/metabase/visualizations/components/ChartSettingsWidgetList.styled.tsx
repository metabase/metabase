import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChartSettingsWidgetListHeader = styled.h4`
  margin-left: 2rem;
  margin-bottom: 1rem;
  color: ${color("bg-dark")};
  text-transform: uppercase;
`;

export const ChartSettingsWidgetListDivider = styled.div`
  background-color: ${color("border")};
  height: 1px;
  display: block;
  margin-bottom: 1.5rem;
  margin-left: 2rem;
  margin-right: 2rem;
`;
