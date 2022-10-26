import React from "react";
import { t } from "ttag";

import Dashboards from "metabase/entities/dashboards";

import type { DataApp, DataAppPage } from "metabase-types/api";

interface Props {
  dataApp: DataApp;
  onSave: (dataAppPage: DataAppPage) => void;
  onClose: () => void;
}

function CreateDataAppPageModalForm({ dataApp, onSave, onClose }: Props) {
  return (
    <Dashboards.ModalForm
      form={Dashboards.forms.dataAppPage}
      title={t`New page`}
      dashboard={{
        collection_id: dataApp.collection_id,
      }}
      onClose={onClose}
      onSaved={onSave}
    />
  );
}

export default CreateDataAppPageModalForm;
