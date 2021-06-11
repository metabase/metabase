import styled from "styled-components";

import { color } from "metabase/lib/colors";

const IconButtonWrapper = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${color("bg-medium")};
  border-radius: ${props => (props.circle ? "50%" : "6px")};
`;

export default IconButtonWrapper;
