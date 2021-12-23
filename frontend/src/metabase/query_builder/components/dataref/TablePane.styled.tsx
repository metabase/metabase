import styled from "styled-components";

import { color } from "metabase/lib/colors";
import _TableInfo from "metabase/components/MetadataInfo/TableInfo";

export const TableInfo = styled(_TableInfo)`
  padding: 1em 0;
  border-bottom: 1px solid ${color("border")};
`;
