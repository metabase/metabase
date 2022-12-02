import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/core/components/NumericInput";

export const CacheInputRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
`;

interface CacheInputMessageProps {
  error?: boolean;
}

export const CacheInputMessage = styled.div<CacheInputMessageProps>`
  color: ${props => color(props.error ? "error" : "text-dark")};
`;

export const CacheInput = styled(NumericInput)`
  width: 3.125rem;
  text-align: center;
`;
