import styled from "@emotion/styled";

import { TableInfoIcon as _TableInfoIcon } from "metabase/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { color } from "metabase/lib/colors";

export const TablesDivider = styled.span`
  color: ${color("text-light")};
  font-size: 1em;
  font-weight: bold;
  padding: 0 0.2em;
  user-select: none;
`;

export const TableInfoIcon = styled(_TableInfoIcon)`
  color: ${color("text-light")};
  visibility: visible;
  font-size: min(1rem, 1em);
  padding: 0;
  margin-left: 0.5em;
  position: relative;
  top: 1px;
`;
