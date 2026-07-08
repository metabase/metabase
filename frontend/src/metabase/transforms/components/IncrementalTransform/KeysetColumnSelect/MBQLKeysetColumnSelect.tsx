import { skipToken, useGetAdhocQueryMetadataQuery } from "metabase/api";
import type { DataAttributes, InputDescriptionProps } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";

import { KeysetColumnSelect } from "./KeysetColumnSelect";

type MBQLKeysetColumnSelectProps = {
  source: TransformSource;
  name: string;
  label: string;
  placeholder: string;
  description: React.ReactNode;
  descriptionProps?: InputDescriptionProps & DataAttributes;
  query: Lib.Query;
  disabled?: boolean;
};

export const MBQLKeysetColumnSelect = ({
  source,
  name,
  label,
  placeholder,
  description,
  descriptionProps,
  query,
  disabled,
}: MBQLKeysetColumnSelectProps) => {
  /**
   * we need this metadata in order to get incremental fields to select
   */
  const { isLoading } = useGetAdhocQueryMetadataQuery(
    source.type === "query" ? source.query : skipToken,
  );
  return (
    <KeysetColumnSelect
      name={name}
      label={label}
      placeholder={placeholder}
      description={description}
      query={query}
      descriptionProps={descriptionProps}
      disabled={disabled}
      isLoading={isLoading}
    />
  );
};
