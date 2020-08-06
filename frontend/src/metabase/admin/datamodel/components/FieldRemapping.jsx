import React from "react";

import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";
import { Flex } from "grid-styled";

import SelectButton from "metabase/components/SelectButton";
import Select from "metabase/components/Select";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import FieldList from "metabase/query_builder/components/FieldList";
import InputBlurChange from "metabase/components/InputBlurChange";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";

import SelectSeparator from "../components/SelectSeparator";

import MetabaseAnalytics from "metabase/lib/analytics";

import Dimension, {
  DatetimeFieldDimension,
  FKDimension,
} from "metabase-lib/lib/Dimension";
import Question from "metabase-lib/lib/Question";

const MAP_OPTIONS = {
  original: { type: "original", name: t`Use original value` },
  foreign: { type: "foreign", name: t`Use foreign key` },
  custom: { type: "custom", name: t`Custom mapping` },
};

export default class FieldRemapping extends React.Component {
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
      [...field.remapping.keys()].every(
        key => typeof key === "number" || key === null,
      );

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

  handleChangeMappingType = async ({ target: { value: mappingType } }) => {
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
      await deleteFieldDimension({ id: field.id });
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
        await updateFieldDimension(
          { id: field.id },
          {
            type: "external",
            name: field.display_name,
            human_readable_field_id: entityNameFieldId,
          },
        );
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
      await updateFieldDimension(
        { id: field.id },
        {
          type: "internal",
          name: field.display_name,
          human_readable_field_id: null,
        },
      );
      this.setState({ hasChanged: true });
    } else {
      throw new Error(t`Unrecognized mapping type`);
    }

    // TODO Atte Keinänen 7/11/17: It's a pretty heavy approach to reload the whole table after a single field
    // has been updated; would be nicer to just fetch a single field. MetabaseApi.field_get seems to exist for that
    await fetchTableMetadata({ id: table.id }, { reload: true });
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
    const dimension = Dimension.parseMBQL(foreignKeyClause);
    if (dimension && dimension instanceof FKDimension) {
      MetabaseAnalytics.trackEvent("Data Model", "Update FK Remapping Target");
      await updateFieldDimension(
        { id: field.id },
        {
          type: "external",
          name: field.display_name,
          human_readable_field_id: dimension.destination().field().id,
        },
      );

      await fetchTableMetadata({ id: table.id }, { reload: true });

      this.refs.fkPopover.close();
    } else {
      throw new Error(t`The selected field isn't a foreign key`);
    }
  };

  onUpdateRemappings = remappings => {
    const { field, updateFieldValues } = this.props;
    return updateFieldValues({ id: field.id }, Array.from(remappings));
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
        <Flex align="center">
          <Select
            value={mappingType}
            onChange={this.handleChangeMappingType}
            options={this.getAvailableMappingTypes()}
            optionValueFn={o => o}
            className="inline-block"
          />
          {mappingType === MAP_OPTIONS.foreign && [
            <SelectSeparator classname="flex" key="foreignKeySeparator" />,
            <PopoverWithTrigger
              ref="fkPopover"
              triggerElement={
                <SelectButton
                  hasValue={hasFKMappingValue}
                  className={cx("flex inline-block no-decoration", {
                    "border-error": dismissedInitialFkTargetPopover,
                    "border-dark": !dismissedInitialFkTargetPopover,
                  })}
                >
                  {fkMappingField ? (
                    fkMappingField.display_name
                  ) : (
                    <span className="text-medium">{t`Choose a field`}</span>
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
                table={table}
                onFieldChange={this.onForeignKeyFieldChange}
                hideSingleSectionTitle
              />
            </PopoverWithTrigger>,
            dismissedInitialFkTargetPopover && (
              <div className="text-error ml2">{t`Please select a column to use for display.`}</div>
            ),
          ]}
        </Flex>
        {hasChanged && hasFKMappingValue && <RemappingNamingTip />}
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

// consider renaming this component to something more descriptive
export class ValueRemappings extends React.Component {
  state = {
    editingRemappings: new Map(),
  };

  componentWillMount() {
    this._updateEditingRemappings(this.props.remappings);
  }

  componentDidUpdate(prevProps) {
    const { remappings } = this.props;
    if (
      !// check if the Maps are different
      (
        prevProps.remappings &&
        remappings &&
        prevProps.remappings.size === remappings.size &&
        [...remappings].every(([k, v]) => prevProps.remappings.get(k) === v)
      )
    ) {
      this._updateEditingRemappings(remappings);
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
            : original === null
            ? "null"
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

export class FieldValueMapping extends React.Component {
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

export const RemappingNamingTip = () => (
  <div className="bordered rounded p1 mt1 mb2 border-brand">
    <span className="text-brand text-bold">{t`Tip: `}</span>
    {t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}
  </div>
);
