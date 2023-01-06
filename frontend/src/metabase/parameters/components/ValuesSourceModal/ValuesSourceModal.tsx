import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import Fields from "metabase/entities/fields";
import { Dispatch, State } from "metabase-types/store";
import { UiParameter } from "metabase-lib/parameters/types";
import { getFields } from "metabase-lib/parameters/utils/fields";
import { isVirtualFieldId } from "metabase-lib/metadata/utils/fields";
import SourceTypeModal from "./SourceTypeModal";

interface ModalOwnProps {
  parameter: UiParameter;
  onClose: () => void;
}

interface ModalStateProps {
  fieldValues: string[];
}

interface ModalDispatchProps {
  onFetchFieldValues: (parameter: UiParameter) => void;
}

type ModalProps = ModalOwnProps & ModalStateProps & ModalDispatchProps;

const ValuesSourceModal = ({
  parameter,
  fieldValues,
  onFetchFieldValues,
  onClose,
}: ModalProps): JSX.Element => {
  const [sourceType, setSourceType] = useState(
    parameter.values_source_type ?? null,
  );
  const [sourceConfig, setSourceConfig] = useState(
    parameter.values_source_config ?? {},
  );

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

const mapStateToProps = (
  state: State,
  { parameter }: ModalProps,
): ModalStateProps => ({
  fieldValues: getFields(parameter)
    .filter(field => !isVirtualFieldId(field.id))
    .flatMap(field =>
      Fields.selectors.getFieldValues(state, { entityId: field.id }),
    )
    .map(value => String(value[0])),
});

const mapDispatchToProps = (dispatch: Dispatch): ModalDispatchProps => ({
  onFetchFieldValues: (parameter: UiParameter) => {
    getFields(parameter)
      .filter(field => !isVirtualFieldId(field.id))
      .forEach(field =>
        dispatch(Fields.actions.fetchFieldValues({ id: field.id })),
      );
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(ValuesSourceModal);
