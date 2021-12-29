import styled from "styled-components";

import TableInfo from "metabase/components/MetadataInfo/TableInfo";

type TableInfoProps = {
  tableId: number;
};

export const WidthBoundTableInfo = styled(TableInfo)<TableInfoProps>`
  width: 300px;
  font-size: 14px;
`;
