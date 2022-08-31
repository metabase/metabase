import React, { useCallback } from "react";
import type { LocationDescriptor } from "history";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";

import DataApps from "metabase/entities/data-apps";

import type { DataApp as IDataApp } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface OwnProps {
  onClose: () => void;
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  onChangeLocation: push,
};

function CreateDataAppModal({ onClose, onChangeLocation }: Props) {
  const handleSave = useCallback(
    (dataApp: IDataApp) => {
      onClose();
      onChangeLocation(Urls.dataApp(dataApp));
    },
    [onClose, onChangeLocation],
  );

  return (
    <DataApps.ModalForm
      form={DataApps.forms.create}
      onSaved={handleSave}
      onClose={onClose}
    />
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(CreateDataAppModal);
