import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const PageHeader = styled.header`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem 0;
  margin-bottom: 4rem;
  border-bottom: 1px solid ${color("border")};
`;

export const PageBody = styled.div`
  margin: 0 auto;
  padding-left: 1em;
  padding-right: 1em;

  ${breakpointMinSmall} {
    max-width: 47rem;
    padding-left: 2em;
    padding-right: 2em;
  }

  ${breakpointMinMedium} {
    padding-left: 3em;
    padding-right: 3em;
  }
`;
