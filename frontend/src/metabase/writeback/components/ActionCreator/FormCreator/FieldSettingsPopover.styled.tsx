import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SettingsPopoverBody = styled.div`
  padding: ${space(3)};
`;

export const SectionLabel = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: ${space(1)};
`;

export const FieldTypeWrapper = styled.div`
  margin-bottom: ${space(2)};
  padding-bottom: ${space(2)};
  border-bottom: 1px solid ${color("border")};
`;
