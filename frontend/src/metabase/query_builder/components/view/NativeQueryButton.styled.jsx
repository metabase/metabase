import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";

export const SqlIconButton = styled(Button)`
  margin-left: ${space(2)};
  padding: ${space(1)};
  border: none;
  background-color: transparent;
  color: ${color("text-medium")};
  cursor: pointer;

  :hover {
    background-color: transparent;
    color: ${color("brand")};
  }
`;

SqlIconButton.defaultProps = {
  icon: "sql",
};
