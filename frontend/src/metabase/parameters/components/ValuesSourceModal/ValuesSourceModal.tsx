import React, { useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import Fields from "metabase/entities/fields";
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
  onClose: () => void;
}

const ValuesSourceModal = ({
  parameter,
  onFetchFieldValues,
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
      onClose={onClose}
    />
  );
};

const mapDispatchToProps = {
  onFetchFieldValues: Fields.actions.fetchFieldValues,
};

export default connect(null, mapDispatchToProps)(ValuesSourceModal);
