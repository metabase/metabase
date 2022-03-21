import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const QueryValidationErrorRoot = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  row-gap: 0.75rem;
`;

export const QueryValidationErrorHeader = styled.div`
  font-size: 20px;
  font-weight: bold;
  color: ${color("text-medium")};
`;

export const QueryValidationErrorMessage = styled.div`
  color: ${color("text-medium")};
`;

export const QueryErrorActionButton = styled(Button)`
  color: ${color("brand")};
  border: none;
  padding: 0;

  &:hover {
    text-decoration: underline;
    background-color: transparent;
  }
`;
