import cx from "classnames";
import { useField } from "formik";
import PropTypes from "prop-types";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import { Icon, Text } from "metabase/ui";

import SemanticTypePickerS from "./SemanticTypePicker.module.css";

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
      <SelectButton
        hasValue={!!field.value}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        ref={selectButtonRef}
        left={
          <Icon
            className={cx(SemanticTypePickerS.FieldTypeIcon, {
              [SemanticTypePickerS.ellipsis]: icon === "ellipsis",
            })}
            size={14}
            name={icon}
          />
        }
      >
        {pickerLabel}
      </SelectButton>
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
