/**
 * Settings editor for a single database field. Lets you change field type, visibility and display values / remappings.
 *
 * TODO Atte Keinänen 7/6/17: This uses the standard metadata API; we should migrate also other parts of admin section
 */

import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";
import _ from "underscore";
import cx from "classnames";
import { t } from "c-3po";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import Select from "metabase/components/Select";
import SaveStatus from "metabase/components/SaveStatus";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import MetabaseAnalytics from "metabase/lib/analytics";

import { getMetadata } from "metabase/selectors/metadata";
import * as metadataActions from "metabase/redux/metadata";
import * as datamodelActions from "../datamodel";

import ActionButton from "metabase/components/ActionButton.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import SelectButton from "metabase/components/SelectButton";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import FieldList from "metabase/query_builder/components/FieldList";
import {
  FieldVisibilityPicker,
  SpecialTypeAndTargetPicker,
} from "metabase/admin/datamodel/components/database/ColumnItem";
import { getDatabaseIdfields } from "metabase/admin/datamodel/selectors";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import Question from "metabase-lib/lib/Question";
import { DatetimeFieldDimension } from "metabase-lib/lib/Dimension";

import { rescanFieldValues, discardFieldValues } from "../field";

import { has_field_values_options } from "metabase/lib/core";
import colors from "metabase/lib/colors";

const SelectClasses =
  "h3 bordered border-dark shadowed p2 inline-block flex align-center rounded text-bold";

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
export default class FieldApp extends Component {
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
                <FieldVisibilityPicker
                  triggerClasses={SelectClasses}
                  field={field.getPlainObject()}
                  updateField={this.onUpdateField}
                />
              </Section>

              <Section>
                <SectionHeader title={t`Type`} />
                <SpecialTypeAndTargetPicker
                  triggerClasses={SelectClasses}
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
                  triggerClasses={SelectClasses}
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
                <UpdateCachedFieldValues
                  rescanFieldValues={() =>
                    this.props.rescanFieldValues(field.id)
                  }
                  discardFieldValues={() =>
                    this.props.discardFieldValues(field.id)
                  }
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

const SelectSeparator = () => (
  <Icon name="chevronright" size={12} className="mx2 text-grey-3" />
);

export class FieldHeader extends Component {
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
          className="h1 AdminInput bordered rounded border-dark block mb1"
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

// consider renaming this component to something more descriptive
export class ValueRemappings extends Component {
  state = {
    editingRemappings: new Map(),
  };

  componentWillMount() {
    this._updateEditingRemappings(this.props.remappings);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.remappings !== this.props.remappings) {
      this._updateEditingRemappings(nextProps.remappings);
    }
  }

  _updateEditingRemappings(remappings) {
    const editingRemappings = new Map(
      [...remappings].map(([original, mappedOrUndefined]) => {
        // Use currently the original value as the "default custom mapping" as the current backend implementation
        // requires that all original values must have corresponding mappings

        // Additionally, the defensive `.toString` ensures that the mapped value definitely will be string
        const mappedString =
          mappedOrUndefined !== undefined
            ? mappedOrUndefined.toString()
            : original.toString();

        return [original, mappedString];
      }),
    );

    const containsUnsetMappings = [...remappings].some(
      ([_, mappedOrUndefined]) => {
        return mappedOrUndefined === undefined;
      },
    );
    if (containsUnsetMappings) {
      // Save the initial values to make sure that we aren't left in a potentially broken state where
      // the dimension type is "internal" but we don't have any values in metabase_fieldvalues
      this.props.updateRemappings(editingRemappings);
    }
    this.setState({ editingRemappings });
  }

  onSetRemapping(original, newMapped) {
    this.setState({
      editingRemappings: new Map([
        ...this.state.editingRemappings,
        [original, newMapped],
      ]),
    });
  }

  onSaveClick = () => {
    MetabaseAnalytics.trackEvent("Data Model", "Update Custom Remappings");
    // Returns the promise so that ButtonWithStatus can show the saving status
    return this.props.updateRemappings(this.state.editingRemappings);
  };

  customValuesAreNonEmpty = () => {
    return Array.from(this.state.editingRemappings.values()).every(
      value => value !== "",
    );
  };

  render() {
    const { editingRemappings } = this.state;

    return (
      <div className="bordered rounded py2 px4 border-dark">
        <div className="flex align-center my1 pb2 border-bottom">
          <h3>{t`Original value`}</h3>
          <h3 className="ml-auto">{t`Mapped value`}</h3>
        </div>
        <ol>
          {[...editingRemappings].map(([original, mapped]) => (
            <li className="mb1">
              <FieldValueMapping
                original={original}
                mapped={mapped}
                setMapping={newMapped =>
                  this.onSetRemapping(original, newMapped)
                }
              />
            </li>
          ))}
        </ol>
        <div className="flex align-center">
          <ButtonWithStatus
            className="ml-auto"
            disabled={!this.customValuesAreNonEmpty()}
            onClickOperation={this.onSaveClick}
          >
            {t`Save`}
          </ButtonWithStatus>
        </div>
      </div>
    );
  }
}

export class FieldValueMapping extends Component {
  onInputChange = e => {
    this.props.setMapping(e.target.value);
  };

  render() {
    const { original, mapped } = this.props;
    return (
      <div className="flex align-center">
        <h3>{original}</h3>
        <InputBlurChange
          className="AdminInput input ml-auto"
          value={mapped}
          onChange={this.onInputChange}
          placeholder={t`Enter value`}
        />
      </div>
    );
  }
}

export const Section = ({ children }) => (
  <section className="my3">{children}</section>
);

export const SectionHeader = ({ title, description }) => (
  <div className="border-bottom py2 mb2">
    <h2 className="text-italic">{title}</h2>
    {description && (
      <p className="mb0 text-grey-4 mt1 text-paragraph text-measure">
        {description}
      </p>
    )}
  </div>
);

const MAP_OPTIONS = {
  original: { type: "original", name: t`Use original value` },
  foreign: { type: "foreign", name: t`Use foreign key` },
  custom: { type: "custom", name: t`Custom mapping` },
};

export class FieldRemapping extends Component {
  state = {
    isChoosingInitialFkTarget: false,
    dismissedInitialFkTargetPopover: false,
  };

  constructor(props, context) {
    super(props, context);
  }

  getMappingTypeForField = field => {
    if (this.state.isChoosingInitialFkTarget) {
      return MAP_OPTIONS.foreign;
    }

    if (_.isEmpty(field.dimensions)) {
      return MAP_OPTIONS.original;
    }
    if (field.dimensions.type === "external") {
      return MAP_OPTIONS.foreign;
    }
    if (field.dimensions.type === "internal") {
      return MAP_OPTIONS.custom;
    }

    throw new Error(t`Unrecognized mapping type`);
  };

  getAvailableMappingTypes = () => {
    const { field } = this.props;

    const hasForeignKeys =
      field.special_type === "type/FK" && this.getForeignKeys().length > 0;

    // Only show the "custom" option if we have some values that can be mapped to user-defined custom values
    // (for a field without user-defined remappings, every key of `field.remappings` has value `undefined`)
    const hasMappableNumeralValues =
      field.remapping.size > 0 &&
      [...field.remapping.keys()].every(key => typeof key === "number");

    return [
      MAP_OPTIONS.original,
      ...(hasForeignKeys ? [MAP_OPTIONS.foreign] : []),
      ...(hasMappableNumeralValues > 0 ? [MAP_OPTIONS.custom] : []),
    ];
  };

  getFKTargetTableEntityNameOrNull = () => {
    const fks = this.getForeignKeys();
    const fkTargetFields = fks[0] && fks[0].dimensions.map(dim => dim.field());

    if (fkTargetFields) {
      // TODO Atte Keinänen 7/11/17: Should there be `isName(field)` in Field.js?
      const nameField = fkTargetFields.find(
        field => field.special_type === "type/Name",
      );
      return nameField ? nameField.id : null;
    } else {
      throw new Error(
        t`Current field isn't a foreign key or FK target table metadata is missing`,
      );
    }
  };

  clearEditingStates = () => {
    this.setState({
      isChoosingInitialFkTarget: false,
      dismissedInitialFkTargetPopover: false,
    });
  };

  onSetMappingType = async mappingType => {
    const {
      table,
      field,
      fetchTableMetadata,
      updateFieldDimension,
      deleteFieldDimension,
    } = this.props;

    this.clearEditingStates();

    if (mappingType.type === "original") {
      MetabaseAnalytics.trackEvent(
        "Data Model",
        "Change Remapping Type",
        "No Remapping",
      );
      await deleteFieldDimension(field.id);
      this.setState({ hasChanged: false });
    } else if (mappingType.type === "foreign") {
      // Try to find a entity name field from target table and choose it as remapping target field if it exists
      const entityNameFieldId = this.getFKTargetTableEntityNameOrNull();

      if (entityNameFieldId) {
        MetabaseAnalytics.trackEvent(
          "Data Model",
          "Change Remapping Type",
          "Foreign Key",
        );
        await updateFieldDimension(field.id, {
          type: "external",
          name: field.display_name,
          human_readable_field_id: entityNameFieldId,
        });
      } else {
        // Enter a special state where we are choosing an initial value for FK target
        this.setState({
          hasChanged: true,
          isChoosingInitialFkTarget: true,
        });
      }
    } else if (mappingType.type === "custom") {
      MetabaseAnalytics.trackEvent(
        "Data Model",
        "Change Remapping Type",
        "Custom Remappings",
      );
      await updateFieldDimension(field.id, {
        type: "internal",
        name: field.display_name,
        human_readable_field_id: null,
      });
      this.setState({ hasChanged: true });
    } else {
      throw new Error(t`Unrecognized mapping type`);
    }

    // TODO Atte Keinänen 7/11/17: It's a pretty heavy approach to reload the whole table after a single field
    // has been updated; would be nicer to just fetch a single field. MetabaseApi.field_get seems to exist for that
    await fetchTableMetadata(table.id, true);
  };

  onForeignKeyFieldChange = async foreignKeyClause => {
    const {
      table,
      field,
      fetchTableMetadata,
      updateFieldDimension,
    } = this.props;

    this.clearEditingStates();

    // TODO Atte Keinänen 7/10/17: Use Dimension class when migrating to metabase-lib
    if (foreignKeyClause.length === 3 && foreignKeyClause[0] === "fk->") {
      MetabaseAnalytics.trackEvent("Data Model", "Update FK Remapping Target");
      await updateFieldDimension(field.id, {
        type: "external",
        name: field.display_name,
        human_readable_field_id: foreignKeyClause[2],
      });

      await fetchTableMetadata(table.id, true);

      this.refs.fkPopover.close();
    } else {
      throw new Error(t`The selected field isn't a foreign key`);
    }
  };

  onUpdateRemappings = remappings => {
    const { field, updateFieldValues } = this.props;
    return updateFieldValues(field.id, Array.from(remappings));
  };

  // TODO Atte Keinänen 7/11/17: Should we have stricter criteria for valid remapping targets?
  isValidFKRemappingTarget = dimension =>
    !(dimension.defaultDimension() instanceof DatetimeFieldDimension);

  getForeignKeys = () => {
    const { table, field } = this.props;

    // this method has a little odd structure due to using fieldOptions(); basically filteredFKs should
    // always be an array with a single value
    const metadata = table.metadata;
    const fieldOptions = Question.create({
      metadata,
      databaseId: table.db.id,
      tableId: table.id,
    })
      .query()
      .fieldOptions();
    const unfilteredFks = fieldOptions.fks;
    const filteredFKs = unfilteredFks.filter(fk => fk.field.id === field.id);

    return filteredFKs.map(filteredFK => ({
      field: filteredFK.field,
      dimension: filteredFK.dimension,
      dimensions: filteredFK.dimensions.filter(this.isValidFKRemappingTarget),
    }));
  };

  onFkPopoverDismiss = () => {
    const { isChoosingInitialFkTarget } = this.state;

    if (isChoosingInitialFkTarget) {
      this.setState({ dismissedInitialFkTargetPopover: true });
    }
  };

  render() {
    const { field, table, fields } = this.props;
    const {
      isChoosingInitialFkTarget,
      hasChanged,
      dismissedInitialFkTargetPopover,
    } = this.state;

    const mappingType = this.getMappingTypeForField(field);
    const isFKMapping = mappingType === MAP_OPTIONS.foreign;
    const hasFKMappingValue =
      isFKMapping && field.dimensions.human_readable_field_id !== null;
    const fkMappingField =
      hasFKMappingValue && fields[field.dimensions.human_readable_field_id];

    return (
      <div>
        <SectionHeader
          title={t`Display values`}
          description={t`Choose to show the original value from the database, or have this field display associated or custom information.`}
        />
        <Select
          triggerClasses={SelectClasses}
          value={mappingType}
          onChange={this.onSetMappingType}
          options={this.getAvailableMappingTypes()}
        />
        {mappingType === MAP_OPTIONS.foreign && [
          <SelectSeparator key="foreignKeySeparator" />,
          <PopoverWithTrigger
            ref="fkPopover"
            triggerElement={
              <SelectButton
                hasValue={hasFKMappingValue}
                className={cx(
                  "flex inline-block no-decoration h3 p2 shadowed",
                  {
                    "border-error": dismissedInitialFkTargetPopover,
                    "border-dark": !dismissedInitialFkTargetPopover,
                  },
                )}
              >
                {fkMappingField ? (
                  fkMappingField.display_name
                ) : (
                  <span className="text-grey-1">{t`Choose a field`}</span>
                )}
              </SelectButton>
            }
            isInitiallyOpen={isChoosingInitialFkTarget}
            onClose={this.onFkPopoverDismiss}
          >
            <FieldList
              className="text-purple"
              field={fkMappingField}
              fieldOptions={{
                count: 0,
                dimensions: [],
                fks: this.getForeignKeys(),
              }}
              tableMetadata={table}
              onFieldChange={this.onForeignKeyFieldChange}
              hideSectionHeader
            />
          </PopoverWithTrigger>,
          dismissedInitialFkTargetPopover && (
            <div className="text-error my2">{t`Please select a column to use for display.`}</div>
          ),
          hasChanged && hasFKMappingValue && <RemappingNamingTip />,
        ]}
        {mappingType === MAP_OPTIONS.custom && (
          <div className="mt3">
            {hasChanged && <RemappingNamingTip />}
            <ValueRemappings
              remappings={field && field.remapping}
              updateRemappings={this.onUpdateRemappings}
            />
          </div>
        )}
      </div>
    );
  }
}

export const RemappingNamingTip = () => (
  <div className="bordered rounded p1 mt1 mb2 border-brand">
    <span className="text-brand text-bold">{t`Tip:`}</span>
    {t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}
  </div>
);

export class UpdateCachedFieldValues extends Component {
  render() {
    return (
      <div>
        <SectionHeader
          title={t`Cached field values`}
          description={t`Metabase can scan the values for this field to enable checkbox filters in dashboards and questions.`}
        />
        <ActionButton
          className="Button mr2"
          actionFn={this.props.rescanFieldValues}
          normalText={t`Re-scan this field`}
          activeText={t`Starting…`}
          failedText={t`Failed to start scan`}
          successText={t`Scan triggered!`}
        />
        <ActionButton
          className="Button Button--danger"
          actionFn={this.props.discardFieldValues}
          normalText={t`Discard cached field values`}
          activeText={t`Starting…`}
          failedText={t`Failed to discard values`}
          successText={t`Discard triggered!`}
        />
      </div>
    );
  }
}
