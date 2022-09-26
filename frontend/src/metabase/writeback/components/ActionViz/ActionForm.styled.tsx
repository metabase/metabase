import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const DataAppPageFormWrapper = styled.div`
  padding: 1.5rem;
  background-color: ${color("white")};
  border-radius: ${space(1)};
  border: 1px solid ${color("border")};
  overflow-y: auto;
`;

export const DataAppPageFormTitle = styled.h4`
  margin-bottom: 1.5rem;
`;
