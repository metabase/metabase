/**
 * Settings editor for a single database field. Lets you change field type, visibility and display values / remappings.
 *
 * TODO Atte Keinänen 7/6/17: This uses the standard metadata API; we should migrate also other parts of admin section
 */

import React from "react";
import { Link } from "react-router";
import { connect } from "react-redux";

import _ from "underscore";
import { t } from "c-3po";

import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import Select from "metabase/components/Select";
import SaveStatus from "metabase/components/SaveStatus";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import Radio from "metabase/components/Radio";

import { getMetadata } from "metabase/selectors/metadata";
import * as metadataActions from "metabase/redux/metadata";
import * as datamodelActions from "../datamodel";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  FieldVisibilityPicker,
  SpecialTypeAndTargetPicker,
} from "metabase/admin/datamodel/components/database/ColumnItem";

import Section, { SectionHeader } from "../components/Section";
import SelectSeparator from "../components/SelectSeparator";

import FieldRemapping from "../components/FieldRemapping";
import UpdateCachedFieldValues from "../components/UpdateCachedFieldValues";

import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";

import { getDatabaseIdfields } from "metabase/admin/datamodel/selectors";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import { rescanFieldValues, discardFieldValues } from "../field";

import { has_field_values_options } from "metabase/lib/core";
import colors from "metabase/lib/colors";

const mapStateToProps = (state, props) => {
  return {
    databaseId: parseInt(props.params.databaseId),
    tableId: parseInt(props.params.tableId),
    fieldId: parseInt(props.params.fieldId),
    metadata: getMetadata(state),
    idfields: getDatabaseIdfields(state),
  };
};

const mapDispatchToProps = {
  fetchDatabaseMetadata: metadataActions.fetchDatabaseMetadata,
  fetchTableMetadata: metadataActions.fetchTableMetadata,
  fetchFieldValues: metadataActions.fetchFieldValues,
  updateField: metadataActions.updateField,
  updateFieldValues: metadataActions.updateFieldValues,
  updateFieldDimension: metadataActions.updateFieldDimension,
  deleteFieldDimension: metadataActions.deleteFieldDimension,
  fetchDatabaseIdfields: datamodelActions.fetchDatabaseIdfields,
  rescanFieldValues,
  discardFieldValues,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldApp extends React.Component {
  state = {
    tab: "general",
  };

  saveStatus: null;

  props: {
    databaseId: number,
    tableId: number,
    fieldId: number,
    metadata: Metadata,
    idfields: Object[],

    fetchDatabaseMetadata: number => Promise<void>,
    fetchTableMetadata: number => Promise<void>,
    fetchFieldValues: number => Promise<void>,
    updateField: any => Promise<void>,
    updateFieldValues: any => Promise<void>,
    updateFieldDimension: any => Promise<void>,
    deleteFieldDimension: any => Promise<void>,
    fetchDatabaseIdfields: number => Promise<void>,
  };

  async componentWillMount() {
    const {
      databaseId,
      tableId,
      fieldId,
      fetchDatabaseMetadata,
      fetchTableMetadata,
      fetchDatabaseIdfields,
      fetchFieldValues,
    } = this.props;

    // A complete database metadata is needed in case that foreign key is changed
    // and then we need to show FK remapping options for a new table
    await fetchDatabaseMetadata(databaseId);

    // Only fetchTableMetadata hydrates `dimension` in the field object
    // Force reload to ensure that we are not showing stale information
    await fetchTableMetadata(tableId, true);

    // load field values if has_field_values === "list"
    const field = this.props.metadata.field(fieldId);
    if (field && field.has_field_values === "list") {
      await fetchFieldValues(fieldId);
    }

    // TODO Atte Keinänen 7/10/17: Migrate this to redux/metadata
    await fetchDatabaseIdfields(databaseId);
  }

  linkWithSaveStatus = saveMethod => {
    const self = this;
    return async (...params) => {
      self.saveStatus && self.saveStatus.setSaving();
      await saveMethod(...params);
      self.saveStatus && self.saveStatus.setSaved();
    };
  };

  onUpdateField = this.linkWithSaveStatus(this.props.updateField);
  onUpdateFieldProperties = this.linkWithSaveStatus(async fieldProps => {
    const { metadata, fieldId } = this.props;
    const field = metadata.fields[fieldId];

    if (field) {
      // `table` and `target` propertes is part of the fully connected metadata graph; drop it because it
      // makes conversion to JSON impossible due to cyclical data structure
      await this.props.updateField({
        ...field.getPlainObject(),
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
      fieldId,
      databaseId,
      tableId,
      idfields,
      fetchTableMetadata,
    } = this.props;

    const db = metadata.databases[databaseId];
    const field = metadata.fields[fieldId];
    const table = metadata.tables[tableId];

    const isLoading = !field || !table || !idfields;

    return (
      <LoadingAndErrorWrapper loading={isLoading} error={null} noWrapper>
        {() => (
          <div className="relative">
            <div className="wrapper wrapper--trim">
              <BackButton databaseId={databaseId} tableId={tableId} />
              <div className="my4 py1 ml-auto mr-auto">
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
              <div className="absolute top right mt4 mr4">
                <SaveStatus ref={ref => (this.saveStatus = ref)} />
              </div>

              <div className="border-bottom">
                <Radio
                  value={this.state.tab}
                  onChange={tab => this.setState({ tab })}
                  options={[
                    { name: t`General`, value: "general" },
                    { name: t`Formatting`, value: "formatting" },
                  ]}
                  underlined
                />
              </div>

              <Section>
                <FieldHeader
                  field={field}
                  updateFieldProperties={this.onUpdateFieldProperties}
                  updateFieldDimension={this.onUpdateFieldDimension}
                />
              </Section>

              <Section>
                <SectionHeader
                  title={t`Visibility`}
                  description={t`Where this field will appear throughout Metabase`}
                />
                <div style={{ maxWidth: 400 }}>
                  <FieldVisibilityPicker
                    field={field.getPlainObject()}
                    updateField={this.onUpdateField}
                  />
                </div>
              </Section>

              <Section>
                <SectionHeader title={t`Field Type`} />
                <SpecialTypeAndTargetPicker
                  field={field.getPlainObject()}
                  updateField={this.onUpdateField}
                  idfields={idfields}
                  selectSeparator={<SelectSeparator />}
                />
              </Section>

              <Section>
                <SectionHeader
                  title={t`Filtering on this field`}
                  description={t`When this field is used in a filter, what should people use to enter the value they want to filter on?`}
                />
                <Select
                  value={_.findWhere(has_field_values_options, {
                    value: field.has_field_values,
                  })}
                  onChange={option =>
                    this.onUpdateFieldProperties({
                      has_field_values: option.value,
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
                  updateFieldProperties={this.onUpdateFieldProperties}
                  updateFieldValues={this.onUpdateFieldValues}
                  updateFieldDimension={this.onUpdateFieldDimension}
                  deleteFieldDimension={this.onDeleteFieldDimension}
                  fetchTableMetadata={fetchTableMetadata}
                />
              </Section>

              <Section>
                <SectionHeader
                  title={t`Cached field values`}
                  description={t`Metabase can scan the values for this field to enable checkbox filters in dashboards and questions.`}
                />
                <UpdateCachedFieldValues
                  rescanFieldValues={() =>
                    this.props.rescanFieldValues(field.id)
                  }
                  discardFieldValues={() =>
                    this.props.discardFieldValues(field.id)
                  }
                />
              </Section>

              <Section>
                <ColumnSettings
                  value={(field && field.settings) || {}}
                  onChange={this.onUpdateFieldSettings}
                  column={field}
                  blacklist={new Set(["column_title"])}
                  inheritedSettings={getGlobalSettingsForColumn(field)}
                />
              </Section>
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

// TODO: Should this invoke goBack() instead?
// not sure if it's possible to do that neatly with Link component
export const BackButton = ({ databaseId, tableId }) => (
  <Link
    to={`/admin/datamodel/database/${databaseId}/table/${tableId}`}
    className="circle text-white p2 mt3 ml3 flex align-center justify-center  absolute top left"
    style={{ backgroundColor: colors["bg-dark"] }}
  >
    <Icon name="backArrow" />
  </Link>
);

export class FieldHeader extends React.Component {
  onNameChange = e => {
    this.updateNameDebounced(e.target.value);
  };
  onDescriptionChange = e => {
    this.updateDescriptionDebounced(e.target.value);
  };

  // Separate update methods because of throttling the input
  updateNameDebounced = _.debounce(async name => {
    const { field, updateFieldProperties, updateFieldDimension } = this.props;

    // Update the dimension name if it exists
    // TODO: Have a separate input field for the dimension name?
    if (!_.isEmpty(field.dimensions)) {
      await updateFieldDimension(field.id, {
        type: field.dimensions.type,
        human_readable_field_id: field.dimensions.human_readable_field_id,
        name,
      });
    }

    // todo: how to treat empty / too long strings? see how this is done in Column
    updateFieldProperties({ display_name: name });
  }, 300);

  updateDescriptionDebounced = _.debounce(description => {
    const { updateFieldProperties } = this.props;
    updateFieldProperties({ description });
  }, 300);

  render() {
    return (
      <div>
        <InputBlurChange
          className="h2 AdminInput bordered rounded border-dark block mb1"
          value={this.props.field.display_name}
          onChange={this.onNameChange}
          placeholder={this.props.field.name}
        />
        <InputBlurChange
          className="text AdminInput bordered input text-measure block full"
          value={this.props.field.description}
          onChange={this.onDescriptionChange}
          placeholder={t`No description for this field yet`}
        />
      </div>
    );
  }
}
