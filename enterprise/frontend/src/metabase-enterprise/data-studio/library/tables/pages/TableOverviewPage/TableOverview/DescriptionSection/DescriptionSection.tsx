import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box } from "metabase/ui";
import type { Table } from "metabase-types/api";

type DescriptionSectionProps = {
  table: Table;
};

export function DescriptionSection({ table }: DescriptionSectionProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateTable({
      id: table.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(t`Failed to update table description`);
    } else {
      sendSuccessToast(t`Table description updated`);
    }
  };

  return (
    <Box data-testid="table-description-section">
      <EditableText
        initialValue={table.description ?? ""}
        placeholder={t`No description`}
        isMarkdown
        onChange={handleChange}
      />
    </Box>
  );
}
