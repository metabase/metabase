import styled from "@emotion/styled";
import Alert from "metabase/core/components/Alert";
import { Button, ButtonProps } from "metabase/ui";
import { Table } from "metabase/collections/components/BaseItemsTable.styled";

export const ArchiveAlert = styled(Alert)`
  margin-bottom: 1.5rem;

  & > div {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
`;

export const ArchiveTable = styled(Table)`
  margin-bottom: 2.5rem;
`;

export const ArchiveViewButton = styled(Button)<
  ButtonProps & React.HTMLProps<HTMLButtonElement>
>`
  flex-shrink: 0;
`;
