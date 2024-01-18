import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const DataSelectorTablePickerContainer = styled.div`
  overflow-y: auto;
  width: 300px;
`;

export const DataSelectorTablePickerHeaderContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
`;

type Props = {
  onClick?: () => void;
};

export const DataSelectorTablePickerHeaderClickable = styled.span<Props>`
  align-items: center;
  display: flex;

  cursor: pointer;
`;

export const DataSelectorTablePickerHeaderDatabaseName = styled.span`
  flex-wrap: wrap;
  margin-left: ${space(1)};
`;

export const DataSelectorTablePickerHeaderSchemaName = styled.span`
  color: ${color("text-medium")};
  flex-wrap: wrap;
  margin-left: ${space(1)};
`;

export const LinkToDocsContainer = styled.div`
  background-color: ${color("bg-light")};
  border-top: 1px solid ${color("border")};
  padding: ${space(2)};
  text-align: center;
`;

export const NoTablesFound = styled.div`
  padding: ${space(4)};
  text-align: center;
`;
