import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChartSettingOrderedSimpleRoot = styled.div`
  padding-left: 1rem;
  padding-bottom: 0.5rem;
`;

export const ChartSettingMessage = styled.div`
  margin: 1rem 0;
  padding: 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${color("bg-light")};
  color: ${color("text-light")};
  font-weight: 700;
  border-radius: 0.5rem;
`;
