import React, { useState, useEffect, useRef, useCallback } from "react";

import { t, ngettext, msgid } from "ttag";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Popover from "metabase/components/Popover";
import Button from "metabase/components/Button";
import Value from "metabase/components/Value";

import Field from "metabase-lib/lib/metadata/Field";

import type { Parameter } from "metabase-types/types/Parameter";
import type { DashboardWithCards } from "metabase-types/types/Dashboard";

type Props = {
  value: any,
  setValue: () => void,

  isEditing: boolean,

  fields: Field[],
  parentFocusChanged: boolean => void,

  dashboard?: DashboardWithCards,
  parameter?: Parameter,
  parameters?: Parameter[],
};

const BORDER_WIDTH = 1;

const normalizeValue = value =>
  Array.isArray(value) ? value : value != null ? [value] : [];

ParameterFieldWidget.noPopover = true;
ParameterFieldWidget.format = format;
function ParameterFieldWidget({
  value,
  setValue,
  isEditing,
  fields,
  parentFocusChanged,
  dashboard,
  parameter,
  parameters,
}: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const [unsavedValue, setUnsavedValue] = useState(normalizeValue(value));
  const [widgetWidth, setWidgetWidth] = useState(null);
  const unfocusedElRef = useRef();

  const savedValue = normalizeValue(value);
  const defaultPlaceholder = isFocused
    ? ""
    : placeholder || t`Enter a value...`;
  const placeholder = isEditing
    ? "Enter a default value..."
    : defaultPlaceholder;

  const onFocus = useCallback(() => {
    if (parentFocusChanged) {
      parentFocusChanged(true);
    }
    setIsFocused(true);
  }, [parentFocusChanged]);
  const onBlur = useCallback(() => {
    if (parentFocusChanged) {
      parentFocusChanged(false);
    }
    setIsFocused(false);
  }, [parentFocusChanged]);

  const addFilter = useCallback(() => {
    setValue(unsavedValue.length > 0 ? unsavedValue : null);
    onBlur();
  }, [unsavedValue, setValue, onBlur]);

  const onUnsavedValueChange = useCallback(value => {
    setUnsavedValue(normalizeValue(value));
  }, []);

  useEffect(() => {
    setUnsavedValue(normalizeValue(value));
  }, [value]);

  useEffect(() => {
    const element = unfocusedElRef.current;
    if (!isFocused && element) {
      const parameterWidgetElement = element.parentNode.parentNode.parentNode;
      if (parameterWidgetElement.clientWidth !== widgetWidth) {
        setWidgetWidth(parameterWidgetElement.clientWidth);
      }
    }
  }, [isFocused, widgetWidth]);

  return isFocused ? (
    <Popover
      horizontalAttachments={["left", "right"]}
      verticalAttachments={["top"]}
      alignHorizontalEdge
      alignVerticalEdge
      targetOffsetY={-19}
      targetOffsetX={33}
      hasArrow={false}
      onClose={onBlur}
    >
      <FieldValuesWidget
        value={unsavedValue}
        parameter={parameter}
        parameters={parameters}
        dashboard={dashboard}
        onChange={onUnsavedValueChange}
        placeholder={placeholder}
        fields={fields}
        multi
        autoFocus
        color="brand"
        style={{
          borderWidth: BORDER_WIDTH,
          minWidth: widgetWidth ? widgetWidth + BORDER_WIDTH * 2 : null,
        }}
        className="border-bottom"
        minWidth={400}
        maxWidth={400}
      />
      {/* border between input and footer comes from border-bottom on FieldValuesWidget */}
      <div className="flex p1">
        <Button
          primary
          className="ml-auto"
          disabled={savedValue.length === 0 && unsavedValue.length === 0}
          onClick={addFilter}
        >
          {savedValue.length > 0 ? "Update filter" : "Add filter"}
        </Button>
      </div>
    </Popover>
  ) : (
    <div
      ref={unfocusedElRef}
      className="flex-full cursor-pointer"
      onClick={onFocus}
    >
      {savedValue.length > 0 ? (
        format(savedValue, fields)
      ) : (
        <span>{placeholder}</span>
      )}
    </div>
  );
}

function format(value, fields) {
  value = normalizeValue(value);
  if (value.length > 1) {
    const n = value.length;
    return ngettext(msgid`${n} selection`, `${n} selections`, n);
  } else {
    return (
      <Value
        // If there are multiple fields, turn off remapping since they might
        // be remapped to different fields.
        remap={fields.length === 1}
        value={value[0]}
        column={fields[0]}
      />
    );
  }
}

export default ParameterFieldWidget;
