import React from "react";

// import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextFileWidget = ({ field }) => (
  <input
    type="file"
    className="Form-input"
    aria-labelledby={`${field.name}-label`}
    onChange={async e => field.onChange(await e.target.files[0].text())}
    // {...formDomOnlyProps(field)}
  />
);

export default FormTextFileWidget;
