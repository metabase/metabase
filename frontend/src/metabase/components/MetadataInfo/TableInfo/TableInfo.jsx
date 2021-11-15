import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Table from "metabase-lib/lib/metadata/Table";
import TableLabel from "metabase/components/MetadataInfo/TableLabel";

import {
  InfoContainer,
  Description,
  EmptyDescription,
} from "../MetadataInfo.styled";

TableInfo.propTypes = {
  className: PropTypes.string,
  table: PropTypes.instanceOf(Table).isRequired,
};

function TableInfo({ className, table }) {
  const description = table.description;

  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <TableLabel table={table} />
    </InfoContainer>
  );
}

export default TableInfo;
