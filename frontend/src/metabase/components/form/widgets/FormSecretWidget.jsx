/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { t } from "ttag";

import { Option } from "metabase/components/Select";

import { Container, Input, StyledSelect } from "./FormSecretWidget.styled";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormSecretWidget = ({
  type = "text",
  placeholder,
  field,
  readOnly,
  autoFocus,
}) => {
  const [inputToShow, setInputToShow] = useState("textInput");

  const handleSelectChange = () => {
    const newInputToShow =
      inputToShow === "textInput" ? "fileInput" : "textInput";

    setInputToShow(newInputToShow);
  };

  return (
    <Container>
      <StyledSelect
        defaultValue={"local"}
        placeholder={placeholder}
        onChange={handleSelectChange}
      >
        <Option key={`secret-select-option1`} value={"local"}>
          {t`Local file`}
        </Option>
        <Option key={`secret-select-option2`} value={"uploaded"}>
          {t`Uploaded file`}
        </Option>
      </StyledSelect>

      {inputToShow === "textInput" && (
        <Input
          className="Form-input"
          type={type}
          placeholder={placeholder}
          aria-labelledby={`${field.name}-label`}
          readOnly={readOnly}
          autoFocus={autoFocus}
          {...formDomOnlyProps(field)}
        />
      )}

      {inputToShow === "fileInput" && (
        <Input
          type="file"
          className={"Form-file-input"}
          aria-labelledby={`${field.name}-label`}
        />
      )}
    </Container>
  );
};

export default FormSecretWidget;
