/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import { Option } from "metabase/components/Select";

import { Container, Input, StyledSelect } from "./FormSecretWidget.styled";

import { formDomOnlyProps } from "metabase/lib/redux";

const isApplicationRunningInCloud = MetabaseSettings.isHosted();

const inputToShowOnRender = isApplicationRunningInCloud
  ? "fileInput"
  : "textInput";

const FormSecretWidget = ({
  type = "text",
  placeholder,
  field,
  readOnly,
  autoFocus,
}) => {
  const [inputToShow, setInputToShow] = useState(inputToShowOnRender);
  const [value, setValue] = useState();

  const handleSelectChange = () => {
    const newInputToShow =
      inputToShow === "textInput" ? "fileInput" : "textInput";

    setInputToShow(newInputToShow);
  };

  const handleTextInputChange = e => {
    setValue(e.target.value);
    console.log("🚀", e.target.value);
  };

  return (
    <Container>
      {isApplicationRunningInCloud || (
        <StyledSelect
          value={inputToShow}
          placeholder={placeholder}
          onChange={handleSelectChange}
        >
          <Option key={`secret-select-option1`} value={"textInput"}>
            {t`Local file path`}
          </Option>
          <Option key={`secret-select-option2`} value={"fileInput"}>
            {t`Uploaded file`}
          </Option>
        </StyledSelect>
      )}

      <Input
        type="text"
        {...formDomOnlyProps(field)}
        aria-labelledby={`${field.name}-label`}
        style={{ display: "none" }}
        value={value}
      />

      {inputToShow === "textInput" && (
        <Input
          className="Form-input"
          type="text"
          placeholder={placeholder}
          readOnly={readOnly}
          autoFocus={autoFocus}
          onChange={handleTextInputChange}
        />
      )}

      {inputToShow === "fileInput" && (
        <Input
          type="file"
          className="Form-file-input"
          aria-labelledby={`${field.name}-label`}
          isFullWidth={isApplicationRunningInCloud}
        />
      )}
    </Container>
  );
};

export default FormSecretWidget;
