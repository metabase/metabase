import React, { useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Select } from "metabase/core/components/Select";
import { SelectButon } from "metabase/core/components/SelectButton";

import { FieldTypeIcon } from "./SemanticTypePicker.styled";

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  formField: PropTypes.shape({
    options: PropTypes.array.isRequired,
    icon: PropTypes.string,
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
  const { options, icon } = formField;

  const selectButtonRef = useRef();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onSelectValue = useCallback(
    e => {
      if (e.target.value === field.value) {
        return;
      }
      field.onChange(e);
      onChange(e);
      selectButtonRef.current?.focus();
    },
    [field, onChange],
  );

  const pickerLabel = useMemo(() => {
    const item = options.find(item => item.id === field.value);
    return item?.name ?? t`None`;
  }, [field, options]);

  const renderSelectButton = useCallback(() => {
    return (
      <SelectButon
        hasValue={!!field.value}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        ref={selectButtonRef}
        left={<FieldTypeIcon name={icon} />}
      >
        {pickerLabel}
      </SelectButon>
    );
  }, [field, icon, tabIndex, pickerLabel, onKeyDown]);

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
