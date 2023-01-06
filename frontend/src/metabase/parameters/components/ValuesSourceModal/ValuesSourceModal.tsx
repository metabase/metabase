import React, { useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import Fields from "metabase/entities/fields";
import { Dispatch } from "metabase-types/store";
import { UiParameter } from "metabase-lib/parameters/types";
import { getFields } from "metabase-lib/parameters/utils/fields";
import { isVirtualFieldId } from "metabase-lib/metadata/utils/fields";
import { getParameterValues } from "metabase-lib/parameters/utils/parameter-values";
import SourceTypeModal from "./SourceTypeModal";

interface ValuesSourceModalOwnProps {
  parameter: UiParameter;
  onClose: () => void;
}

interface ValuesSourceModalDispatchProps {
  onFetchFieldValues: (parameter: UiParameter) => void;
}

type ValuesSourceModalProps = ValuesSourceModalOwnProps &
  ValuesSourceModalDispatchProps;

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
    onFetchFieldValues(parameter);
  }, [parameter, onFetchFieldValues]);

  return (
    <SourceTypeModal
      sourceType={sourceType}
      sourceConfig={sourceConfig}
      fieldValues={fieldValues}
      onChangeSourceType={setSourceType}
      onChangeSourceConfig={setSourceConfig}
      onClose={onClose}
    />
  );
};

const mapDispatchToProps = (
  dispatch: Dispatch,
): ValuesSourceModalDispatchProps => ({
  onFetchFieldValues: (parameter: UiParameter) => {
    getFields(parameter)
      .filter(field => !isVirtualFieldId(field.id))
      .forEach(field =>
        dispatch(Fields.actions.fetchFieldValues({ id: field.id })),
      );
  },
});

export default connect(null, mapDispatchToProps)(ValuesSourceModal);
