import React, { useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Select from "metabase/components/Select";

import { isCurrency, isFK } from "metabase/lib/schema_metadata";

import CurrencyPicker from "./CurrencyPicker";
import FKTargetPicker from "./FKTargetPicker";
import {
  StyledSelectButton,
  ExtraSelectContainer,
} from "./SemanticTypePicker.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    field_ref: PropTypes.array.isRequired,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  options: PropTypes.array.isRequired,
  IDFields: PropTypes.array.isRequired, // list of PK / FK fields in dataset DB
  tabIndex: PropTypes.string,
  onKeyDown: PropTypes.func,
};

function SemanticTypePicker({ field, options, IDFields, tabIndex, onKeyDown }) {
  const selectButtonRef = useRef();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onChange = useCallback(
    item => {
      field.onChange(item.id);
      selectButtonRef.current?.focus();
    },
    [field],
  );

  const pickerLabel = useMemo(() => {
    const item = options.find(item => item.id === field.value);
    return item?.name ?? t`None`;
  }, [field, options]);

  const renderExtraSelect = useCallback(() => {
    const pseudoField = { semantic_type: field.value };

    if (isFK(pseudoField)) {
      return (
        <ExtraSelectContainer>
          <FKTargetPicker
            field={field}
            onChange={() => {}}
            IDFields={IDFields}
          />
        </ExtraSelectContainer>
      );
    }

    if (isCurrency(pseudoField)) {
      return (
        <ExtraSelectContainer>
          <CurrencyPicker field={field} onChange={() => {}} />
        </ExtraSelectContainer>
      );
    }

    return null;
  }, [field, IDFields]);

  const renderSelectButton = useCallback(
    ({ open }) => {
      const handleKeyUp = e => {
        if (e.key === "Enter") {
          open();
        }
      };

      return (
        <StyledSelectButton
          hasValue={!!field.value}
          onKeyUp={handleKeyUp}
          onKeyDown={onKeyDown}
          tabIndex={tabIndex}
          ref={selectButtonRef}
        >
          {pickerLabel}
        </StyledSelectButton>
      );
    },
    [field, tabIndex, pickerLabel, onKeyDown],
  );

  return (
    <React.Fragment>
      <Select
        value={field.value}
        options={options}
        onChange={onChange}
        optionValueFn={o => o.id}
        optionSectionFn={o => o.section}
        placeholder={t`Select a semantic type`}
        searchProp="name"
        searchPlaceholder={t`Search for a special type`}
        triggerElement={renderSelectButton}
        onClose={focusSelectButton}
      />
      {renderExtraSelect()}
    </React.Fragment>
  );
}

SemanticTypePicker.propTypes = propTypes;

export default SemanticTypePicker;
