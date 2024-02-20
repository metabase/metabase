import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { BackButtonLink } from "./MetadataBackButton.styled";

interface MetadataBackButtonProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId: SchemaId;
  selectedTableId: TableId;
}

const MetadataBackButton = ({
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
}: MetadataBackButtonProps) => {
  return (
    <BackButtonLink
      to={Urls.dataModelTable(
        selectedDatabaseId,
        selectedSchemaId,
        selectedTableId,
      )}
    >
      <Icon name="arrow_left" />
    </BackButtonLink>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataBackButton;
