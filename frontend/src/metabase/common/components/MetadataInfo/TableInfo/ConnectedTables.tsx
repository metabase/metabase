import { t } from "ttag";

import { useQuestionFromOpts } from "metabase/metadata-store";
import * as Urls from "metabase/urls";
import type { NormalizedTable } from "metabase-types/api";

import { Container, Label, LabelContainer } from "../MetadataInfo.styled";

import {
  InteractiveTableLabel,
  LabelButton,
  LabelLink,
} from "./ConnectedTables.styled";

export type ConnectedTable = Pick<
  NormalizedTable,
  "id" | "db_id" | "display_name"
>;

type Props = {
  tables: ConnectedTable[];
  onConnectedTableClick?: (table: ConnectedTable) => void;
};

export function ConnectedTables({ tables, onConnectedTableClick }: Props) {
  return tables.length ? (
    <Container>
      <LabelContainer color="text-primary">
        <Label>{t`Connected to these tables`}</Label>
      </LabelContainer>
      {tables.slice(0, 8).map((fkTable) => {
        return onConnectedTableClick ? (
          <ConnectedTableButton
            key={fkTable.id}
            table={fkTable}
            onClick={onConnectedTableClick}
          />
        ) : (
          <ConnectedTableLink key={fkTable.id} table={fkTable} />
        );
      })}
    </Container>
  ) : null;
}

function ConnectedTableButton({
  table,
  onClick,
}: {
  table: ConnectedTable;
  onClick: (table: ConnectedTable) => void;
}) {
  return (
    <LabelButton key={table.id} onClick={() => onClick(table)}>
      <InteractiveTableLabel table={table} />
    </LabelButton>
  );
}

function ConnectedTableLink({ table }: { table: ConnectedTable }) {
  const buildQuestion = useQuestionFromOpts();
  const question = buildQuestion({
    DEPRECATED_RAW_MBQL_databaseId: table.db_id,
    DEPRECATED_RAW_MBQL_tableId: table.id,
  }).setDefaultDisplay();

  return (
    <LabelLink to={Urls.question(question)}>
      <InteractiveTableLabel table={table} />
    </LabelLink>
  );
}
