import React from "react";

import TextEditor from "metabase/components/TextEditor";

const ChartSettingCode = ({ value, onChange, ...props }) => (
  <TextEditor
    className="bordered rounded"
    value={value}
    onChange={onChange}
    sizeToFit
    {...props}
  />
);

export default ChartSettingCode;
