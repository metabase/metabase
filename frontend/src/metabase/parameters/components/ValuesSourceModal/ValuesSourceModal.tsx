import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import Fields from "metabase/entities/fields";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import { getNonVirtualFields } from "metabase-lib/parameters/utils/parameter-fields";
import { getParameterValues } from "metabase-lib/parameters/utils/parameter-values";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesSourceTypeModal from "./ValuesSourceTypeModal";

interface FetchFieldValuesOpts {
  id: Field["id"];
}

interface ValuesSourceModalProps {
  parameter: UiParameter;
  onFetchFieldValues: (opts: FetchFieldValuesOpts) => void;
  onSubmit: (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => void;
  onClose: () => void;
}

const ValuesSourceModal = ({
  parameter,
  onFetchFieldValues,
  onSubmit,
  onClose,
}: ValuesSourceModalProps): JSX.Element => {
  const [sourceType, setSourceType] = useState(
    parameter.values_source_type ?? null,
  );

  const [sourceConfig, setSourceConfig] = useState(
    parameter.values_source_config ?? {},
  );

  const fieldValues = useMemo(() => {
    return getParameterValues(parameter);
  }, [parameter]);

  const handleSubmit = useCallback(() => {
    onSubmit(sourceType, sourceConfig);
  }, [sourceType, sourceConfig, onSubmit]);

  useEffect(() => {
    getNonVirtualFields(parameter).forEach(field => onFetchFieldValues(field));
  }, [parameter, onFetchFieldValues]);

  return (
    <ValuesSourceTypeModal
      sourceType={sourceType}
      sourceConfig={sourceConfig}
      fieldValues={fieldValues}
      onChangeSourceType={setSourceType}
      onChangeSourceConfig={setSourceConfig}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};

const mapDispatchToProps = {
  onFetchFieldValues: Fields.actions.fetchFieldValues,
};

export default connect(null, mapDispatchToProps)(ValuesSourceModal);
