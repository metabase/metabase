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

export const IconWrapper = styled.span`
  color: ${color("text-light")};
  display: inline-block;
  font-size: 1rem;
  margin-left: 0.5rem;
  vertical-align: middle;
`;
