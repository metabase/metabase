import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ModelInfoPanel = styled.div`
  padding-left: 3rem;
  border-left: 1px solid ${color("border")};
  min-width: 15rem;
`;

export const ModelInfoTitle = styled.p`
  color: ${color("text-dark")};
  font-weight: 600;

  margin: 0;
`;

export const ModelInfoText = styled.p`
  color: ${color("text-medium")};
`;
