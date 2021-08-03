import styled from "styled-components";

import { color } from "metabase/lib/colors";

export const ParametersWidgetContainer = styled.div.attrs({
  className: "wrapper flex flex-column align-start mt2",
})`
  background-color: ${color("bg-light")};
  margin: 0 auto;
  padding-top: 10px !important;
  padding-bottom: 5px !important;
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 3;
`;
