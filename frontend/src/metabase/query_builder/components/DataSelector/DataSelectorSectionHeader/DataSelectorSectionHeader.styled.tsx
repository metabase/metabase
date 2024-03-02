import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const DataSelectorSectionHeaderContainer = styled.div`
  align-items: center;
  border-bottom: 1px solid ${color("border")};
  display: flex;
  padding: ${space(2)};
`;

export const DataSelectorSectionHeading = styled.h3`
  color: ${color("text-dark")};
`;
