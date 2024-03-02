import styled from "@emotion/styled";

import DashboardPicker from "metabase/containers/DashboardPicker";
import SelectButton from "metabase/core/components/SelectButton/SelectButton";

export const DashboardPickerContainer = styled.div`
  padding: 1.5rem;
`;

export const StyledDashboardPicker = styled(DashboardPicker)`
  min-width: 600px;
`;

export const DashboardPickerButton = styled(SelectButton)`
  min-width: 400px;
`;
