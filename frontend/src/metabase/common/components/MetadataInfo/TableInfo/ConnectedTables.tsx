import { useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { NormalizedTable } from "metabase-types/api";

import { Container, Label, LabelContainer } from "../MetadataInfo.styled";
import { TableLabel } from "../TableLabel/TableLabel";

import S from "./ConnectedTables.module.css";

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
    <Box
      component="button"
      key={table.id}
      className={S.connectedTable}
      ta="left"
      onClick={() => onClick(table)}
    >
      <TableLabel className={S.label} table={table} color="text-disabled" />
    </Box>
  );
}

function ConnectedTableLink({ table }: { table: ConnectedTable }) {
  const buildQuestion = useQuestionFromOptsBuilder();
  const url = useMemo(() => {
    const question = buildQuestion({
      dataset_query: {
        database: table.db_id,
        type: "query",
        query: { "source-table": table.id },
      },
    }).setDefaultDisplay();

    return Urls.question(question);
  }, [buildQuestion, table.db_id, table.id]);

  return (
    <Link className={S.connectedTable} to={url}>
      <TableLabel className={S.label} table={table} color="text-disabled" />
    </Link>
  );
}
