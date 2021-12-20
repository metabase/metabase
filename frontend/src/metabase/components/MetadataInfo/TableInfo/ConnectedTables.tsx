import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Table from "metabase-lib/lib/metadata/Table";
import Link from "metabase/components/Link";

import { Label, LabelContainer } from "../MetadataInfo.styled";
import { InteractiveTableLabel, Container } from "./TableInfo.styled";

ConnectedTables.propTypes = {
  table: PropTypes.instanceOf(Table).isRequired,
};

function ConnectedTables({ table }: { table: Table }) {
  const fkTables = table.connectedTables();
  return fkTables.length ? (
    <Container>
      <LabelContainer color="text-dark">
        <Label>{t`Connected to these tables`}</Label>
      </LabelContainer>
      {fkTables.map(fkTable => {
        return (
          <Link key={fkTable.id} to={fkTable.newQuestion().getUrl()}>
            <InteractiveTableLabel table={fkTable} />
          </Link>
        );
      })}
    </Container>
  ) : null;
}

export default ConnectedTables;
