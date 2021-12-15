import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const OptionContent = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const CurrencySymbol = styled.span`
  color: ${color("text-light")};
  font-weight: bold;
  margin-left: 0.5rem;
`;
