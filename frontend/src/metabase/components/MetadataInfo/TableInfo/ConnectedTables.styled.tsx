import styled from "styled-components";

import { color } from "metabase/lib/colors";

import TableLabel from "../TableLabel/TableLabel";

export const InteractiveTableLabel = styled(TableLabel)`
  cursor: pointer;
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }
`;
