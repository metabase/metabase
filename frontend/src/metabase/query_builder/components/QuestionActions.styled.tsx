import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import DatasetMetadataStrengthIndicator from "./view/sidebars/DatasetManagementSection/DatasetMetadataStrengthIndicator";

export const QuestionActionsDivider = styled.div`
  border-left: 1px solid ${color("border")};
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  height: 1.25rem;
`;

export const StrengthIndicator = styled(DatasetMetadataStrengthIndicator)`
  float: none;
  margin-left: 3.5rem;
`;
