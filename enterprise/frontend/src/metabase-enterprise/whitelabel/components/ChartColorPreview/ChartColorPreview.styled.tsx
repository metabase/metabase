import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

export const TableRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  margin-top: 2rem;

  ${breakpointMinLarge} {
    margin-top: 0;
  }
`;

export const TableHeader = styled.div`
  display: block;
  padding: 1rem 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem 0.5rem 0 0;

  ${breakpointMinLarge} {
    border-left: none;
    border-top-left-radius: 0;
  }
`;

export const TableTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
`;

export const TableBody = styled.div`
  flex: 1 1 0;
  padding: 3rem 1.5rem;
  min-height: 24rem;
  border: 1px solid ${color("border")};
  border-top: none;
  border-radius: 0 0 0.5rem 0.5rem;

  ${breakpointMinLarge} {
    border-left: none;
    border-bottom-left-radius: 0;
  }
`;
