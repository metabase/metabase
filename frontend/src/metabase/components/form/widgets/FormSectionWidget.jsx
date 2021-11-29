import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Expander from "metabase/components/Expander";

const propTypes = {
  field: PropTypes.object.isRequired,
};

const FormSectionWidget = ({ field }) => {
  return (
    <Expander isExpanded={field.value} onChange={field.onChange}>
      {field.value ? t`Hide advanced options` : t`Show advanced options`}
    </Expander>
  );
};

FormSectionWidget.propTypes = propTypes;

export default FormSectionWidget;
