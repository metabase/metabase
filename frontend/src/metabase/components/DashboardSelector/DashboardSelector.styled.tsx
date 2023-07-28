import styled from "@emotion/styled";
import SelectButton from "metabase/core/components/SelectButton/SelectButton";
import DashboardPicker from "metabase/containers/DashboardPicker";

export const DashboardPickerContainer = styled.div`
  padding: 1.5rem;
`;

export const StyledDashboardPicker = styled(DashboardPicker)`
  min-width: 600px;
`;

export const DashboardPickerButton = styled(SelectButton)`
  min-width: 400px;
`;
