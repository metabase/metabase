import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/components/Button";
import EditBar from "metabase/components/EditBar";

const propTypes = {
  question: PropTypes.object.isRequired,
};

function DatasetMetadataEditor(props) {
  console.log("### DatasetMetadataEditor", props);
  return (
    <EditBar
      title={`You're editing`}
      buttons={[
        <Button key="cancel" small>{t`Cancel`}</Button>,
        <Button key="save" small>{t`Save changes`}</Button>,
      ]}
    />
  );
}

DatasetMetadataEditor.propTypes = propTypes;

export default DatasetMetadataEditor;
