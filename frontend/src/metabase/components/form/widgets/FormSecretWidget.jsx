/* eslint-disable react/prop-types */
import React, { useState } from "react";
import styled from "styled-components";
import { t } from "ttag";

import Select, { Option } from "metabase/components/Select";

import { formDomOnlyProps } from "metabase/lib/redux";

const Container = styled.div`
  display: flex;
  justify-content: space-between;
`;

const StyledSelect = styled(Select)`
  width: 30%;
`;

const Input = styled.input`
  width: calc(70% - 10px);
`;

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

      {inputToShow === "fileInput" && <div>File input</div>}
    </Container>
  );
};

export default FormSecretWidget;
