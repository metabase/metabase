import styled from "styled-components";

import TableInfo from "metabase/components/MetadataInfo/TableInfo";

type TableInfoProps = {
  tableId: number;
};

export const WidthBoundTableInfo = styled(TableInfo)<TableInfoProps>`
  max-width: 300px;
  min-width: 300px;
`;
