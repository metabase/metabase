import React from "react";
import PropTypes from "prop-types";
// FIXME: using pure seems to mess with redux form updates
// import pure from "recompose/pure";
import cx from "classnames";
import { t } from "ttag";
import S from "./GuideDetailEditor.css";

import Select from "metabase/components/Select";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { typeToBgClass } from "../utils.js";
import { SchemaTableAndSegmentDataSelector } from "metabase/query_builder/components/DataSelector";

const GuideDetailEditor = ({
  className,
  type,
  entities,
  metadata = {},
  selectedIds = [],
  selectedIdTypePairs = [],
  formField,
  removeField,
  editLabelClasses,
}) => {
  const {
    databases,
    tables,
    segments,
    metrics,
    fields,
    metricImportantFields,
  } = metadata;

  const bgClass = typeToBgClass[type];
  const entityId = formField.id.value;
  const disabled =
    formField.id.value === null || formField.id.value === undefined;
  const tableId = metrics && metrics[entityId] && metrics[entityId].table_id;
  const tableFields =
    (tables && tables[tableId] && tables[tableId].fields) || [];
  const fieldsByMetric =
    type === "metric" ? tableFields.map(fieldId => fields[fieldId]) : [];

  const selectClasses = "input h3 px2 py1";

  const selectedIdsSet = new Set(selectedIds);
  return (
    <div className={cx("mb2 border-bottom pb4 text-measure", className)}>
      <div className="relative mt2 flex align-center">
        <div
          style={{
            width: 40,
            height: 40,
            left: -60,
          }}
          className={cx(
            "absolute text-white flex align-center justify-center",
            bgClass,
          )}
        >
          <Icon name={type === "metric" ? "ruler" : type} />
        </div>
        <div className="py2">
          {entities ? (
            <Select
              placeholder={t`Select...`}
              value={formField.id.value}
              onChange={({ target: { value } }) => {
                const entity = entities[value];
                //TODO: refactor into function
                formField.id.onChange(entity.id);
                formField.points_of_interest.onChange(
                  entity.points_of_interest || "",
                );
                formField.caveats.onChange(entity.caveats || "");
                if (type === "metric") {
                  formField.important_fields.onChange(
                    metricImportantFields[entity.id] &&
                      metricImportantFields[entity.id].map(
                        fieldId => fields[fieldId],
                      ),
                  );
                }
              }}
              options={Object.values(entities)}
              optionNameFn={option => option.display_name || option.name}
              optionValueFn={option => option.id}
              optionDisabledFn={o => selectedIdsSet.has(o.id)}
            />
          ) : (
            <SchemaTableAndSegmentDataSelector
              className={cx(
                selectClasses,
                "inline-block",
                "rounded",
                "text-bold",
              )}
              triggerIconSize={12}
              selectedTableId={
                formField.type.value === "table" &&
                Number.parseInt(formField.id.value)
              }
              selectedDatabaseId={
                formField.type.value === "table" &&
                tables[formField.id.value] &&
                tables[formField.id.value].db_id
              }
              selectedSegmentId={
                formField.type.value === "segment" &&
                Number.parseInt(formField.id.value)
              }
              databases={Object.values(databases).map(database => ({
                ...database,
                tables: database.tables.map(tableId => tables[tableId]),
              }))}
              setDatabaseFn={() => null}
              tables={Object.values(tables)}
              disabledTableIds={selectedIdTypePairs
                .filter(idTypePair => idTypePair[1] === "table")
                .map(idTypePair => idTypePair[0])}
              setSourceTableFn={tableId => {
                const table = tables[tableId];
                formField.id.onChange(table.id);
                formField.type.onChange("table");
                formField.points_of_interest.onChange(
                  table.points_of_interest || null,
                );
                formField.caveats.onChange(table.caveats || null);
              }}
              segments={Object.values(segments)}
              disabledSegmentIds={selectedIdTypePairs
                .filter(idTypePair => idTypePair[1] === "segment")
                .map(idTypePair => idTypePair[0])}
              setSourceSegmentFn={segmentId => {
                const segment = segments[segmentId];
                formField.id.onChange(segment.id);
                formField.type.onChange("segment");
                formField.points_of_interest.onChange(
                  segment.points_of_interest || "",
                );
                formField.caveats.onChange(segment.caveats || "");
              }}
            />
          )}
        </div>
        <div className="ml-auto cursor-pointer text-light">
          <Tooltip tooltip={t`Remove item`}>
            <Icon name="close" width={16} height={16} onClick={removeField} />
          </Tooltip>
        </div>
      </div>
      <div className="mt2 text-measure">
        <div className={cx("mb2", { disabled: disabled })}>
          <EditLabel>
            {type === "dashboard"
              ? t`Why is this dashboard the most important?`
              : t`What is useful or interesting about this ${type}?`}
          </EditLabel>
          <textarea
            className={S.guideDetailEditorTextarea}
            placeholder={t`Write something helpful here`}
            {...formField.points_of_interest}
            disabled={disabled}
          />
        </div>

        <div className={cx("mb2", { disabled: disabled })}>
          <EditLabel>
            {type === "dashboard"
              ? t`Is there anything users of this dashboard should be aware of?`
              : t`Anything users should be aware of about this ${type}?`}
          </EditLabel>
          <textarea
            className={S.guideDetailEditorTextarea}
            placeholder={t`Write something helpful here`}
            {...formField.caveats}
            disabled={disabled}
          />
        </div>
        {type === "metric" && (
          <div className={cx("mb2", { disabled: disabled })}>
            <EditLabel key="metricFieldsLabel">
              {t`Which 2-3 fields do you usually group this metric by?`}
            </EditLabel>
            <Select
              placeholder={t`Select...`}
              multiple
              value={formField.important_fields.value || []}
              onChange={({ target: { value } }) =>
                formField.important_fields.onChange(value)
              }
              disabled={formField.id.value == null}
              options={fieldsByMetric}
              optionNameFn={metric => metric.display_name || metric.name}
              optionValueFn={metric => metric.id}
              optionDisabledFn={metric =>
                formField.important_fields &&
                formField.important_fields.length >= 3 &&
                !formField.important_fields.includes(metric.id)
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

const EditLabel = ({ children }) => <h3 className="mb1">{children}</h3>;

GuideDetailEditor.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string.isRequired,
  entities: PropTypes.object,
  metadata: PropTypes.object,
  selectedIds: PropTypes.array,
  selectedIdTypePairs: PropTypes.array,
  formField: PropTypes.object.isRequired,
  removeField: PropTypes.func.isRequired,
};

export default GuideDetailEditor;
