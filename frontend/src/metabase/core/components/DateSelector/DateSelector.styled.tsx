import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const SelectorContent = styled.div`
  margin: 0 0.75rem 0.75rem;
`;

export const SelectorField = styled.div`
  margin-bottom: 1rem;
`;

export const SelectorFieldLabel = styled.label`
  display: block;
  color: ${color("text-medium")};
  font-size: 0.75rem;
  font-weight: 900;
  margin-bottom: 0.5rem;
`;

export const SelectorFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const SelectorTimeButton = styled(Button)`
  padding-left: 0;
  padding-right: 0;
`;

export const SelectorSubmitButton = styled(Button)`
  margin-left: auto;
`;
