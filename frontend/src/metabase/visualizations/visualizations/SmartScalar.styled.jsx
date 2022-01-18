import styled from "styled-components";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxExtraSmall,
  space,
} from "metabase/styled-components/theme";

export const PreviousValueContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  margin-top: ${space(0)};

  ${breakpointMaxExtraSmall} {
    flex-direction: column;
  }
`;

export const PreviousValueVariation = styled.h4`
  align-items: center;
  color: ${color("text-light")};
  display: flex;

  ${breakpointMaxExtraSmall} {
    text-transform: capitalize;
  }
`;

export const PreviousValueSeparator = styled.span`
  color: ${color("text-light")};
  font-size: 0.7rem;
  margin: 0 ${space(0)};

  ${breakpointMaxExtraSmall} {
    display: none;
  }
`;
