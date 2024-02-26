import styled from "@emotion/styled";
import { Link } from "react-router";

import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

export const ColumnInput = styled(InputBlurChange)`
  width: auto;
`;

export const FieldSettingsLink = styled(Link)`
  margin-right: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
