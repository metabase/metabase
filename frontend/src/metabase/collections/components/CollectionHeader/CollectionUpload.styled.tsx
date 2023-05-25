import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const UploadInput = styled.input`
  display: none;
`;

export const LoadingStateContainer = styled.div`
  display: flex;
  transform: translateY(10px);
  align-items: center;
  height: 16px;
  color: ${color("brand")};
`;
