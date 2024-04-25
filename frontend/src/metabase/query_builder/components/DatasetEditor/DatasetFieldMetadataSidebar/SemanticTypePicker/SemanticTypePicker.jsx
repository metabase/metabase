import { useField } from "formik";
import PropTypes from "prop-types";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import Select from "metabase/core/components/Select";
import SelectButon from "metabase/core/components/SelectButton";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import { Text } from "metabase/ui";

import { FieldTypeIcon } from "./SemanticTypePicker.styled";

const propTypes = {
  name: PropTypes.string,
  label: PropTypes.string,
  tabIndex: PropTypes.string,
  onKeyDown: PropTypes.func,
  options: PropTypes.array,
  onChange: PropTypes.func,
};

function SemanticTypePicker({
  name,
  tabIndex,
  onKeyDown,
  options,
  label,
  onChange,
}) {
  const [field, _, { setValue }] = useField(name);

  const selectButtonRef = useRef();

  const focusSelectButton = useCallback(() => {
    selectButtonRef.current?.focus();
  }, []);

  const onSelectValue = useCallback(
    e => {
      if (e.target.value === field.value) {
        return;
      }
      setValue(e.target.value);
      onChange?.(e.target.value);
      selectButtonRef.current?.focus();
    },
    [field, setValue, onChange],
  );

  const pickerLabel = useMemo(() => {
    const item = options.find(item => item.id === field.value);
    return item?.name ?? t`None`;
  }, [field, options]);

  const renderSelectButton = useCallback(() => {
    const icon = getSemanticTypeIcon(field.value, "ellipsis");
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
  }, [field, tabIndex, pickerLabel, onKeyDown]);

  return (
    <>
      <Text fw="bold" color="text-medium">
        {label}
      </Text>
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
    </>
  );
}

SemanticTypePicker.propTypes = propTypes;

export default SemanticTypePicker;
