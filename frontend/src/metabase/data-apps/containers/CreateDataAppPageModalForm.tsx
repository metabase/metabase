import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import DataApps from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";

import type { DataApp, DataAppPage } from "metabase-types/api";

interface OwnProps {
  dataApp: DataApp;
  onSave: (dataAppPage: DataAppPage) => void;
  onClose: () => void;
}

interface DispatchProps {
  handleUpdateDataApp: (
    dataApp: Partial<DataApp> & { id: DataApp["id"] },
  ) => void;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  handleUpdateDataApp: DataApps.actions.update,
};

function CreateDataAppPageModalForm({
  dataApp,
  handleUpdateDataApp,
  onSave,
  onClose,
}: Props) {
  const onSaved = useCallback(
    (dataAppPage: DataAppPage) => {
      const navItems = [...dataApp.nav_items, { page_id: dataAppPage.id }];
      handleUpdateDataApp({ id: dataApp.id, nav_items: navItems });
      onSave(dataAppPage);
    },
    [dataApp, handleUpdateDataApp, onSave],
  );

  return (
    <Dashboards.ModalForm
      form={Dashboards.forms.dataAppPage}
      title={t`New page`}
      dashboard={{
        collection_id: dataApp.collection_id,
      }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export default connect(null, mapDispatchToProps)(CreateDataAppPageModalForm);
