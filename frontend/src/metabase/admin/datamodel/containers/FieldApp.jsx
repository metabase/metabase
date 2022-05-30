/**
 * Settings editor for a single database field. Lets you change field type, visibility and display values / remappings.
 *
 * TODO Atte Keinänen 7/6/17: This uses the standard metadata API; we should migrate also other parts of admin section
 */
/* eslint-disable react/prop-types */
import React from "react";
import { Link } from "react-router";
import { connect } from "react-redux";

import _ from "underscore";
import { t } from "ttag";
import { humanizeCoercionStrategy } from "./humanizeCoercionStrategy";

// COMPONENTS

import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import Select from "metabase/core/components/Select";
import SaveStatus from "metabase/components/SaveStatus";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import AdminLayout from "metabase/components/AdminLayout";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import Section, { SectionHeader } from "../components/Section";
import SelectSeparator from "../components/SelectSeparator";

import { is_coerceable, coercions_for_type } from "cljs/metabase.types";
import { isFK } from "metabase/lib/types";

import {
  FieldVisibilityPicker,
  SemanticTypeAndTargetPicker,
} from "../components/database/ColumnItem";
import FieldRemapping from "../components/FieldRemapping";
import UpdateCachedFieldValues from "../components/UpdateCachedFieldValues";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";

// SELECTORS
import { getMetadata } from "metabase/selectors/metadata";

// ACTIONS
import { rescanFieldValues, discardFieldValues } from "../field";

// LIB
import { has_field_values_options } from "metabase/lib/core";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isCurrency } from "metabase/lib/schema_metadata";

import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import Fields from "metabase/entities/fields";

const mapStateToProps = (state, props) => {
  const databaseId = parseInt(props.params.databaseId);
  const fieldId = parseInt(props.params.fieldId);
  return {
    databaseId,
    fieldId,
    field: Fields.selectors.getObjectUnfiltered(state, { entityId: fieldId }),
    fieldsError: Fields.selectors.getError(state, {
      entityId: fieldId,
      requestType: "values",
    }),
    tableId: parseInt(props.params.tableId),
    metadata: getMetadata(state),
    idfields: Databases.selectors.getIdfields(state, { databaseId }),
  };
};

const mapDispatchToProps = {
  fetchDatabaseMetadata: Databases.actions.fetchDatabaseMetadata,
  fetchTableMetadata: Tables.actions.fetchMetadataAndForeignTables,
  fetchFieldValues: Fields.actions.fetchFieldValues,
  updateField: Fields.actions.updateField,
  updateFieldValues: Fields.actions.updateFieldValues,
  updateFieldDimension: Fields.actions.updateFieldDimension,
  deleteFieldDimension: Fields.actions.deleteFieldDimension,
  rescanFieldValues,
  discardFieldValues,
};

class FieldApp extends React.Component {
  state = {
    tab: "general",
  };

  constructor(props) {
    super(props);
    this.saveStatusRef = React.createRef();
  }

  async componentDidMount() {
    const {
      databaseId,
      tableId,
      fieldId,
      fetchDatabaseMetadata,
      fetchTableMetadata,
      fetchFieldValues,
    } = this.props;

    await Promise.all([
      // A complete database metadata is needed in case that foreign key is
      // changed and then we need to show FK remapping options for a new table
      fetchDatabaseMetadata(
        { id: databaseId },
        { params: { include_hidden: true } },
      ),

      // Only fetchTableMetadata hydrates `dimension` in the field object
      // Force reload to ensure that we are not showing stale information
      fetchTableMetadata(
        { id: tableId },
        { reload: true, params: { include_sensitive_fields: true } },
      ),

      // always load field values even though it's only needed if
      // has_field_values === "list"
      fetchFieldValues({ id: fieldId }),
    ]);
  }

  linkWithSaveStatus = saveMethod => async (...args) => {
    this.saveStatusRef.current && this.saveStatusRef.current.setSaving();
    await saveMethod(...args);
    this.saveStatusRef.current && this.saveStatusRef.current.setSaved();
  };

  onUpdateFieldProperties = this.linkWithSaveStatus(async fieldProps => {
    const { field } = this.props;

    if (field) {
      // `table` and `target` propertes is part of the fully connected metadata graph; drop it because it
      // makes conversion to JSON impossible due to cyclical data structure
      await this.props.updateField({
        ...field,
        ...fieldProps,
      });
    } else {
      console.warn(
        "Updating field properties in fields settings failed because of missing field metadata",
      );
    }
  });
  onUpdateFieldValues = this.linkWithSaveStatus(this.props.updateFieldValues);
  onUpdateFieldDimension = this.linkWithSaveStatus(
    this.props.updateFieldDimension,
  );
  onDeleteFieldDimension = this.linkWithSaveStatus(
    this.props.deleteFieldDimension,
  );

  onUpdateFieldSettings = settings => {
    return this.onUpdateFieldProperties({ settings });
  };

  render() {
    const {
      metadata,
      field,
      fieldsError,
      databaseId,
      tableId,
      idfields,
      rescanFieldValues,
      discardFieldValues,
      fetchTableMetadata,
      location,
      params: { section },
    } = this.props;

    const db = metadata.database(databaseId);
    const table = metadata.table(tableId);

    const isLoading = !field || !table || !idfields;

    return (
      <LoadingAndErrorWrapper loading={isLoading} error={null} noWrapper>
        {() => (
          <AdminLayout
            sidebar={
              <div>
                <div className="flex align-center mb2">
                  <BackButton databaseId={databaseId} tableId={tableId} />
                </div>
                <LeftNavPane>
                  <LeftNavPaneItem
                    name={t`General`}
                    path={location.pathname.replace(/[^/]+$/, "general")}
                    index
                  />
                  <LeftNavPaneItem
                    name={t`Formatting`}
                    path={location.pathname.replace(/[^/]+$/, "formatting")}
                  />
                </LeftNavPane>
              </div>
            }
          >
            <div className="wrapper">
              {db && table && (
                <div className="mb4 pt2 ml-auto mr-auto">
                  <Breadcrumbs
                    crumbs={[
                      [db.name, `/admin/datamodel/database/${db.id}`],
                      [
                        table.display_name,
                        `/admin/datamodel/database/${db.id}/table/${table.id}`,
                      ],
                      t`${field.display_name} – Field Settings`,
                    ]}
                  />
                </div>
              )}
              <div className="absolute top right mt4 mr4">
                <SaveStatus ref={this.saveStatusRef} />
              </div>

              {section == null || section === "general" ? (
                <FieldGeneralPane
                  field={field}
                  fieldsError={fieldsError}
                  idfields={idfields}
                  table={table}
                  metadata={metadata}
                  onUpdateFieldValues={this.onUpdateFieldValues}
                  onUpdateFieldProperties={this.onUpdateFieldProperties}
                  onUpdateFieldDimension={this.onUpdateFieldDimension}
                  onDeleteFieldDimension={this.onDeleteFieldDimension}
                  rescanFieldValues={rescanFieldValues}
                  discardFieldValues={discardFieldValues}
                  fetchTableMetadata={fetchTableMetadata}
                />
              ) : section === "formatting" ? (
                <FieldSettingsPane
                  field={field}
                  onUpdateFieldSettings={this.onUpdateFieldSettings}
                />
              ) : null}
            </div>
          </AdminLayout>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(FieldApp);

const FieldGeneralPane = ({
  field,
  fieldsError,
  idfields,
  table,
  metadata,
  onUpdateFieldValues,
  onUpdateFieldProperties,
  onUpdateFieldDimension,
  onDeleteFieldDimension,
  rescanFieldValues,
  discardFieldValues,
  fetchTableMetadata,
}) => (
  <div>
    <Section first>
      <FieldHeader
        field={field}
        updateFieldProperties={onUpdateFieldProperties}
        updateFieldDimension={onUpdateFieldDimension}
      />
    </Section>

    <Section>
      <SectionHeader
        title={t`Visibility`}
        description={t`Where this field will appear throughout Metabase`}
      />
      <div style={{ maxWidth: 400 }}>
        <FieldVisibilityPicker
          field={field}
          updateField={onUpdateFieldProperties}
        />
      </div>
    </Section>

    <Section>
      <SectionHeader title={t`Field Type`} />
      <SemanticTypeAndTargetPicker
        className="flex align-center"
        field={field}
        updateField={onUpdateFieldProperties}
        idfields={idfields}
        selectSeparator={<SelectSeparator />}
      />
    </Section>

    {!isFK(field.semantic_type) && is_coerceable(field.base_type) && (
      <Section>
        <SectionHeader title={t`Cast to a specific data type`} />
        <Select
          className="inline-block"
          placeholder={t`Select a conversion`}
          searchProp="name"
          value={field.coercion_strategy}
          onChange={({ target: { value } }) =>
            onUpdateFieldProperties({
              coercion_strategy: value,
            })
          }
          options={[
            ...coercions_for_type(field.base_type).map(c => ({
              id: c,
              name: c,
            })),
            {
              id: null,
              name: t`Don't cast`,
            },
          ]}
          optionValueFn={field => field.id}
          optionNameFn={field => humanizeCoercionStrategy(field.name)}
          optionIconFn={field => null}
        />
      </Section>
    )}
    <Section>
      <SectionHeader
        title={t`Filtering on this field`}
        description={t`When this field is used in a filter, what should people use to enter the value they want to filter on?`}
      />
      <Select
        className="inline-block"
        value={field.has_field_values}
        onChange={({ target: { value } }) =>
          onUpdateFieldProperties({
            has_field_values: value,
          })
        }
        options={has_field_values_options}
      />
    </Section>

    <Section>
      <SectionHeader
        title={t`Display values`}
        description={t`Choose to show the original value from the database, or have this field display associated or custom information.`}
      />
      <FieldRemapping
        field={field}
        table={table}
        fields={metadata.fields}
        fieldsError={fieldsError}
        updateFieldProperties={onUpdateFieldProperties}
        updateFieldValues={onUpdateFieldValues}
        updateFieldDimension={onUpdateFieldDimension}
        deleteFieldDimension={onDeleteFieldDimension}
        fetchTableMetadata={fetchTableMetadata}
      />
    </Section>

    <Section last>
      <SectionHeader
        title={t`Cached field values`}
        description={t`Metabase can scan the values for this field to enable checkbox filters in dashboards and questions.`}
      />
      <UpdateCachedFieldValues
        rescanFieldValues={() => rescanFieldValues(field.id)}
        discardFieldValues={() => discardFieldValues(field.id)}
      />
    </Section>
  </div>
);

const FieldSettingsPane = ({ field, onUpdateFieldSettings }) => (
  <Section last>
    <ColumnSettings
      value={(field && field.settings) || {}}
      onChange={onUpdateFieldSettings}
      column={field}
      denylist={
        new Set(
          ["column_title"].concat(isCurrency(field) ? ["number_style"] : []),
        )
      }
      inheritedSettings={getGlobalSettingsForColumn(field)}
      forcefullyShowHiddenSettings
    />
  </Section>
);

// TODO: Should this invoke goBack() instead?
// not sure if it's possible to do that neatly with Link component
export const BackButton = ({ databaseId, tableId }) => (
  <Link
    to={`/admin/datamodel/database/${databaseId}/table/${tableId}`}
    className="circle text-white p2 flex align-center justify-center bg-dark bg-brand-hover"
  >
    <Icon name="arrow_left" />
  </Link>
);

export class FieldHeader extends React.Component {
  onNameChange = async e => {
    const { field, updateFieldProperties, updateFieldDimension } = this.props;

    // Update the dimension name if it exists
    // TODO: Have a separate input field for the dimension name?
    if (!_.isEmpty(field.dimensions)) {
      await updateFieldDimension(
        { id: field.id },
        {
          type: field.dimensions.type,
          human_readable_field_id: field.dimensions.human_readable_field_id,
          name: e.target.value,
        },
      );
    }

    // todo: how to treat empty / too long strings? see how this is done in Column
    updateFieldProperties({ display_name: e.target.value });
  };

  onDescriptionChange = e => {
    const { updateFieldProperties } = this.props;
    updateFieldProperties({ description: e.target.value });
  };

  render() {
    return (
      <div>
        <InputBlurChange
          name="display_name"
          className="h2 AdminInput bordered rounded border-dark block mb1"
          value={this.props.field.display_name}
          onBlurChange={this.onNameChange}
          placeholder={this.props.field.name}
        />
        <InputBlurChange
          name="description"
          className="text AdminInput bordered input text-measure block full"
          value={this.props.field.description}
          onBlurChange={this.onDescriptionChange}
          placeholder={t`No description for this field yet`}
        />
      </div>
    );
  }
}
