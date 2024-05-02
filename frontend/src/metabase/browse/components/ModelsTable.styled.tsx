import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ModelTableRow = styled.tr`
  cursor: pointer;
  :outline {
    outline: 2px solid ${color("brand")};
  }
`;

export const LoadingAndErrorWrapperTableRow = styled.tr`
  :hover {
    background-color: inherit !important;
  }
`;
