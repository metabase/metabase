/* eslint-disable react/prop-types */
import { PointerSensor, useSensor } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { Sortable, SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import { moveElement } from "metabase/lib/arrays";

import { ChartSettingFieldPicker } from "./ChartSettingFieldPicker";
import { AddAnotherContainer } from "./ChartSettingFieldsPicker.styled";

export const UNDEFINED_ITEM_KEY = "$$UNDEFINED_ITEM_KEY$$";
export const NULL_ITEM_KEY = "$$NULL_ITEM_KEY$$";

const convertFieldToSortableField = (field) => {
  switch (field) {
    case undefined:
      return UNDEFINED_ITEM_KEY;
    case null:
      return NULL_ITEM_KEY;
    default:
      return field;
  }
};
const convertSortableFieldToField = (field) => {
  switch (field) {
    case UNDEFINED_ITEM_KEY:
      return undefined;
    case NULL_ITEM_KEY:
      return null;
    default:
      return field;
  }
};

const convertFieldsToSortableFields = (fields) =>
  fields.map(convertFieldToSortableField);

const ChartSettingFieldsPicker = ({
  value: fields = [],
  options,
  onChange,
  addAnother,
  showColumnSetting,
  showColumnSettingForIndicies,
  fieldSettingWidgets = [],
  ...props
}) => {
  const sortableFields = useMemo(
    () => convertFieldsToSortableFields(fields),
    [fields],
  );
  const getId = useCallback((field) => field, []);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleDragEnd = ({ id: sortableField, newIndex }) => {
    const field = convertSortableFieldToField(sortableField);
    const oldIndex = fields.indexOf(field);

    onChange(moveElement(fields, oldIndex, newIndex));
  };

  const calculateOptions = useCallback(
    (field) =>
      options.filter(
        (option) =>
          fields.findIndex((v) => v === option.value) < 0 ||
          option.value === field,
      ),
    [fields, options],
  );

  const isDragDisabled = fields?.length <= 1;

  const renderItem = useCallback(
    ({ item: sortableField, id, index: fieldIndex }) => {
      const field = convertSortableFieldToField(sortableField);

      return (
        <Sortable
          id={id}
          key={`sortable-${id}`}
          disabled={isDragDisabled}
          draggingStyle={{ opacity: 0.5 }}
        >
          <ChartSettingFieldPicker
            className={CS.mb1}
            {...props}
            showColumnSetting={
              showColumnSetting ||
              showColumnSettingForIndicies?.includes(fieldIndex)
            }
            key={id}
            value={field}
            options={calculateOptions(field)}
            onChange={(updatedField) => {
              const fieldsCopy = [...fields];
              // this swaps the position of the existing value
              const existingIndex = fields.indexOf(updatedField);
              if (existingIndex >= 0) {
                fieldsCopy.splice(existingIndex, 1, fields[fieldIndex]);
              }
              // replace with the new value
              fieldsCopy.splice(fieldIndex, 1, updatedField);
              onChange(fieldsCopy);
            }}
            onRemove={
              fields.filter((field) => field != null).length > 1 ||
              (fields.length > 1 && field == null)
                ? () =>
                    onChange([
                      ...fields.slice(0, fieldIndex),
                      ...fields.slice(fieldIndex + 1),
                    ])
                : null
            }
            showDragHandle={fields.length > 1}
            fieldSettingWidget={fieldSettingWidgets[fieldIndex]}
          />
        </Sortable>
      );
    },
    [
      isDragDisabled,
      props,
      showColumnSetting,
      showColumnSettingForIndicies,
      calculateOptions,
      fields,
      fieldSettingWidgets,
      onChange,
    ],
  );

  return (
    <div>
      {fields?.length >= 0 ? (
        <SortableList
          getId={getId}
          renderItem={renderItem}
          items={sortableFields}
          onSortEnd={handleDragEnd}
          sensors={[pointerSensor]}
          dividers={[]}
        />
      ) : (
        <span className={CS.textError}>{t`error`}</span>
      )}
      {addAnother && (
        <AddAnotherContainer>
          <a
            className={cx(CS.textBrand, CS.textBold, CS.py1)}
            onClick={() => {
              const remaining = options.filter(
                (o) => fields.indexOf(o.value) < 0,
              );
              if (remaining.length === 1) {
                // if there's only one unused option, use it
                onChange(fields.concat([remaining[0].value]));
              } else {
                // otherwise leave add a new blank item
                onChange(fields.concat([undefined]));
              }
            }}
          >
            {addAnother}
          </a>
        </AddAnotherContainer>
      )}
    </div>
  );
};

export default ChartSettingFieldsPicker;
