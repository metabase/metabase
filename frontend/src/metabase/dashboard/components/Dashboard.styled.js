import styled from "styled-components";
import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme/media-queries";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme/space";

const Wrapper = styled.div`
  margin: 10px auto 0;
  width: 100%;

  ${breakpointMinSmall} {
    padding-left: 2em;
    padding-right: 2em;
  }

  ${breakpointMinMedium} {
    padding-left: 3em;
    padding-right: 3em;
  }
`;

export const ParametersWidgetContainer = styled(Wrapper)`
  align-items: flex-start;
  background-color: ${color("bg-light")};
  display: flex;
  flex-direction: column;
  padding-top: ${space(2)};
  padding-bottom: ${space(1)};
  position: sticky;
  top: 0;
  z-index: 3;
`;
