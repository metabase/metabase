import { useGetFieldQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TableColumnInfo } from "metabase/common/components/MetadataInfo/ColumnInfo";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";

import type { DataReferenceFieldItem, DataReferencePaneProps } from "./types";

export const FieldPane = ({
  onBack,
  onClose,
  id,
}: DataReferencePaneProps<DataReferenceFieldItem>) => {
  const { data: field, isLoading, error } = useGetFieldQuery({ id });

  if (!field || isLoading || error) {
    return (
      <LoadingAndErrorWrapper loading={isLoading || !field} error={error} />
    );
  }

  return (
    <SidebarContent
      title={field.name}
      icon="field"
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <TableColumnInfo
          field={field}
          // TODO
          // timezone={field.table?.database?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
