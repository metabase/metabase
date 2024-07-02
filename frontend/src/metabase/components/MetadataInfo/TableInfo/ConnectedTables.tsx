import PropTypes from "prop-types";
import { t } from "ttag";

import Table from "metabase-lib/v1/metadata/Table";
import * as ML_Urls from "metabase-lib/v1/urls";

import { Label, LabelContainer, Container } from "../MetadataInfo.styled";

import {
  InteractiveTableLabel,
  LabelButton,
  LabelLink,
} from "./ConnectedTables.styled";

ConnectedTables.propTypes = {
  table: PropTypes.instanceOf(Table).isRequired,
};

type Props = {
  table: Table;
  onConnectedTableClick?: (table: Table) => void;
};

function ConnectedTables({ table, onConnectedTableClick }: Props) {
  const fkTables = table.connectedTables();

  return fkTables.length ? (
    <Container>
      <LabelContainer color="text-dark">
        <Label>{t`Connected to these tables`}</Label>
      </LabelContainer>
      {fkTables.slice(0, 8).map(fkTable => {
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
  table: Table;
  onClick: (table: Table) => void;
}) {
  return (
    <LabelButton key={table.id} onClick={() => onClick(table)}>
      <InteractiveTableLabel table={table} />
    </LabelButton>
  );
}

function ConnectedTableLink({ table }: { table: Table }) {
  return (
    <LabelLink to={ML_Urls.getUrl(table.newQuestion())}>
      <InteractiveTableLabel table={table} />
    </LabelLink>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ConnectedTables;
