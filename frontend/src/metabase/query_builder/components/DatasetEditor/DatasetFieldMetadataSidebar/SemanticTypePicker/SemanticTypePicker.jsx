import React, { useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Select from "metabase/components/Select";

import { StyledSelectButton } from "./SemanticTypePicker.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  formField: PropTypes.shape({
    options: PropTypes.array.isRequired,
  }),
  tabIndex: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onKeyDown: PropTypes.func,
};

function SemanticTypePicker({
  field,
  formField,
  tabIndex,
  onChange,
  onKeyDown,
}) {
  const { options } = formField;

  const selectButtonRef = useRef();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onSelectValue = useCallback(
    value => {
      field.onChange(value);
      onChange(value);
      selectButtonRef.current?.focus();
    },
    [field, onChange],
  );

  const pickerLabel = useMemo(() => {
    const item = options.find(item => item.id === field.value);
    return item?.name ?? t`None`;
  }, [field, options]);

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
    <Select
      value={field.value}
      options={options}
      onChange={onSelectValue}
      optionValueFn={o => o.id}
      optionSectionFn={o => o.section}
      placeholder={t`Select a semantic type`}
      searchProp="name"
      searchPlaceholder={t`Search for a special type`}
      hideEmptySectionsInSearch
      triggerElement={renderSelectButton}
      onClose={focusSelectButton}
    />
  );
}

SemanticTypePicker.propTypes = propTypes;

export default SemanticTypePicker;
