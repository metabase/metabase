import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const PickerRoot = styled.div`
  margin-top: 1.5rem;
`;

export const PickerRow = styled.div`
  display: flex;
  align-items: center;
`;

export const PickerSpacedRow = styled(PickerRow)`
  margin-top: 1rem;
`;

export const PickerText = styled.span`
  font-weight: bold;
  min-width: 48px;
`;

export const ScheduleDescriptionContainer = styled.div`
  margin-top: 1rem;
  color: ${color("text-medium")};
`;
