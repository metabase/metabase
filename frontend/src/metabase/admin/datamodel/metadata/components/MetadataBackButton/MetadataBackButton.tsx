import React from "react";
import * as Urls from "metabase/lib/urls";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, TableId } from "metabase-types/api";
import { BackButtonLink } from "./MetadataBackButton.styled";

interface MetadataBackButtonProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaName: string;
  selectedTableId: TableId;
}

const MetadataBackButton = ({
  selectedDatabaseId,
  selectedSchemaName,
  selectedTableId,
}: MetadataBackButtonProps) => {
  return (
    <BackButtonLink
      to={Urls.dataModelTable(
        selectedDatabaseId,
        selectedSchemaName,
        selectedTableId,
      )}
    >
      <Icon name="arrow_left" />
    </BackButtonLink>
  );
};

export default MetadataBackButton;
