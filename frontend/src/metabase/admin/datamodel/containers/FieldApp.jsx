/**
 * Settings editor for a single database field. Lets you change field type, visibility and display values / remappings.
 *
 * TODO Atte Keinänen 7/6/17: This uses the standard metadata API; we should migrate also other parts of admin section
 */

import React, { Component } from 'react'
import { Link } from 'react-router'
import { connect } from "react-redux";
import _ from "underscore";

import Button from 'metabase/components/Button'
import Icon from 'metabase/components/Icon'
import Input from 'metabase/components/Input'
import Select from 'metabase/components/Select'

import { getMetadata } from "metabase/selectors/metadata";
import * as metadataActions from "metabase/redux/metadata";

import Metadata from "metabase/meta/metadata/Metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Field from "metabase/meta/metadata/Field";
import Query from "metabase/lib/query";
import SelectButton from "metabase/components/SelectButton";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import FieldList from "metabase/query_builder/components/FieldList";

const SelectClasses = 'h3 border-dark shadowed p2'

const mapStateToProps = (state, props) => {
    return {
        databaseId: parseInt(props.params.databaseId),
        tableId: parseInt(props.params.tableId),
        fieldId: parseInt(props.params.fieldId),
        metadata: getMetadata(state)
    }
}

const mapDispatchToProps = {
    fetchDatabaseMetadata: metadataActions.fetchDatabaseMetadata,
    fetchTableMetadata: metadataActions.fetchTableMetadata,
    updateField: metadataActions.updateField,
    updateFieldValues: metadataActions.updateFieldValues,
    updateFieldDimension: metadataActions.updateFieldDimension,
    deleteFieldDimension: metadataActions.deleteFieldDimension
}

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldApp extends Component {
    props: {
        databaseId: number,
        tableId: number,
        fieldId: number,
        metadata: Metadata,

        fetchDatabaseMetadata: (number) => Promise<void>,
        updateField: (Field) => Promise<void>
    }

    async componentWillMount() {
        const {tableId, fetchDatabaseMetadata, fetchTableMetadata} = this.props;

        // Only fetchTableMetadata hydrates `dimensions` and user-defined `values` in the field object
        await fetchTableMetadata(tableId);

        // await fetchDatabaseMetadata(tableId);
    }

    onUpdateFieldProperties = async (fieldProps) => {
        const { metadata, fieldId } = this.props;
        const field = metadata.fields[fieldId];

        if (field) {
            // TODO: Should Object.assign be used in this case ??
            await this.props.updateField({ ...field, ...fieldProps, table: undefined });
        } else {
            console.warn("Updating field properties in fields settings failed because of missing field metadata")
        }
    }

    render () {
        const { metadata, fieldId, databaseId, tableId, updateFieldValues, updateFieldDimension, deleteFieldDimension, fetchTableMetadata } = this.props;

        // Provide the Field and Table wrappers to child components as metadata lib doesn't wrap them automatically before metabase-lib
        const field = metadata.fields[fieldId] && new Field(metadata.fields[fieldId]);
        const table = metadata.tables[tableId] && new Field(metadata.tables[tableId]);

        // TODO: How to show a metadata loading error here?
        return (
            <LoadingAndErrorWrapper loading={!field} error={null} noWrapper>
                { () =>
                    <div className="relative">
                        <div className="wrapper wrapper--trim">
                            <BackButton databaseId={databaseId} tableId={tableId} />

                            <Section>
                                <FieldHeader
                                    field={field}
                                    updateFieldProperties={this.onUpdateFieldProperties}
                                />
                            </Section>

                            {/*<Section>*/}
                                {/*<FieldType*/}
                                    {/*field={field}*/}
                                    {/*updateFieldProperties={this.onUpdateFieldProperties}*/}
                                {/*/>*/}
                            {/*</Section>*/}

                            {/*<Section>*/}
                                {/*<FieldVisibility*/}
                                    {/*field={field}*/}
                                    {/*updateFieldProperties={this.onUpdateFieldProperties}*/}
                                {/*/>*/}
                            {/*</Section>*/}

                            <Section>
                                <FieldRemapping
                                    field={field}
                                    table={table}
                                    fields={metadata.fields}
                                    updateFieldProperties={this.onUpdateFieldProperties}
                                    updateFieldValues={updateFieldValues}
                                    updateFieldDimension={updateFieldDimension}
                                    deleteFieldDimension={deleteFieldDimension}
                                    fetchTableMetadata={fetchTableMetadata}
                                />
                            </Section>
                        </div>
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

// TODO: Should this invoke goBack() instead?
// not sure if it's possible to do that neatly with Link component
const BackButton = ({ databaseId, tableId }) =>
    <Link
        to={`/admin/datamodel/database/${databaseId}/table/${tableId}`}
        className="circle text-white p2 mt3 ml3 flex align-center justify-center  absolute top left"
        style={{ backgroundColor: '#8091AB' }}
    >
        <Icon name="backArrow" />
    </Link>

// TODO: Replicate the implementation from Column component
class FieldVisibility extends Component {
    render () {
        return (
            <div>
                <SectionHeader title="Visibility" description="Where this field will appear throughout Metabase" />
                <Select
                    className={SelectClasses}
                    value={{ name: 'Everywhere' }}
                    options={[{}, {}]}
                />
            </div>
        )
    }
}

const SelectSeparator = () =>
    <Icon
        name="chevronright"
        size={12}
        className="mx2 text-grey-3"
    />

// TODO: Replicate the implementation from Column component
class FieldType extends Component {
    onUpdateFieldType() {

    }

    render () {
        return (
            <div>
                <SectionHeader title="Type" />
                <div className="flex align-center">
                    <Select
                        className={SelectClasses}
                        value={{ name: 'Foreign Key' }}
                        options={[{}, {}]}
                    />
                    <SelectSeparator />
                    <Select
                        className={SelectClasses
                        }value={{ name: 'Order Statuses' }}
                        options={[{}, {}]}
                    />
                </div>
            </div>
        )
    }
}

class FieldHeader extends Component {
    onNameChange = (e) => {
        const { updateFieldProperties } = this.props;
        const display_name = e.target.value;
        // todo: how to treat empty / too long strings? see how this is done in Column
        updateFieldProperties({ display_name })
    }

    onDescriptionChange = (e) => {
        const { updateFieldProperties } = this.props
        const description = e.target.value;
        updateFieldProperties({ description })
    }

    render () {
        return (
            <div>
                <Input
                    className="h1 AdminInput bordered rounded border-dark block mb1"
                    value={this.props.field.display_name}
                    onChange={this.onNameChange}
                    placeholder={this.props.field.name}
                />
                <Input
                    className="text AdminInput bordered input text-measure block full"
                    value={this.props.field.description}
                    onChange={this.onDescriptionChange}
                    placeholder="No description for this field yet"
                />
            </div>
        )
}
}

// consider renaming this component to something more descriptive
class ValueRemappings extends Component {
    constructor(props, context) {
        super(props, context);

        const editingRemappings = new Map([...props.remappings]
            .map(([original, mappedOrUndefined]) => {
                // Use currently the original value as the "default custom mapping" as the current backend implementation
                // requires that all original values must have corresponding mappings

                // Additionally, the defensive `.toString` ensures that the mapped value definitely will be string
                const mappedString =
                    mappedOrUndefined !== undefined ? mappedOrUndefined.toString() : original.toString();

                return [original, mappedString]
            })
        )

        const containsUnsetMappings = [...props.remappings].some(([_, mappedOrUndefined]) => {
            return mappedOrUndefined === undefined;
        })
        if (containsUnsetMappings) {
            // Save the initial values to make sure that we aren't left in a potentially broken state where
            // the dimension type is "internal" but we don't have any values in metabase_fieldvalues
            this.props.updateRemappings(editingRemappings);
        }

        this.state = {
            editingRemappings
        }
    }

    onSetRemapping(original, newMapped) {
        this.setState({
            editingRemappings: new Map([
                ...this.state.editingRemappings,
                [original, newMapped]
            ])
        });
    }

    onSaveClick = () => {
        this.props.updateRemappings(this.state.editingRemappings);
    }

    customValuesAreNonEmpty = () => {
        return Array.from(this.state.editingRemappings.values())
            .every((value) => value !== "")
    }

    render () {
        const { editingRemappings } = this.state;

        return (
            <div className="bordered rounded py2 px4 border-dark">
                <div className="flex align-center my1 pb2 border-bottom">
                    <h3>Original value</h3>
                    <h3 className="ml-auto">Mapped value</h3>
                </div>
                <ol>
                    { [...editingRemappings].map(([original, mapped]) =>
                        <li className="mb1">
                            <FieldValueMapping
                                original={original}
                                mapped={mapped}
                                setMapping={(newMapped) => this.onSetRemapping(original, newMapped) }
                            />
                        </li>
                    )}
                </ol>
                <div className="flex align-center">
                    <Button
                        className="ml-auto"
                        primary
                        disabled={!this.customValuesAreNonEmpty()}
                        onClick={this.onSaveClick}
                    >
                        Save
                    </Button>
                </div>
            </div>
        )
    }
}

class FieldValueMapping extends Component {
    onInputChange = (e) => {
        this.props.setMapping(e.target.value)
    }

    render () {
        const { original, mapped } = this.props
        return (
            <div className="flex align-center">
                <h3>{original}</h3>
                <Input
                    className="AdminInput input ml-auto"
                    value={mapped}
                    onChange={this.onInputChange}
                    placeholder={"Enter value"}
                />
            </div>
        )
    }
}

const Section = ({ children }) => <section className="my3">{children}</section>

const SectionHeader = ({ title, description }) =>
    <div className="border-bottom py2 mb2">
        <h2 className="text-italic">{title}</h2>
        { description && <p className="mb0 text-grey-4 mt1 text-paragraph text-measure">{description}</p> }
    </div>

const MAP_OPTIONS = {
    original: { type: "original", name: 'Use original value' },
    foreign:  { type: "foreign", name: 'Use foreign key' },
    custom:   { type: "custom", name: 'Custom mapping' }
}

class FieldRemapping extends Component {

    constructor(props, context) {
        super(props, context);

        // could we simply infer mappingType from metadata instead of resorting to local state?
        this.state = {
            mappingType: this.getMappingType()
        }
    }

    getMappingType = () => {
        const { field } = this.props;

        if (_.isEmpty(field.dimensions)) return MAP_OPTIONS.original;
        if (field.dimensions.type === "external") return MAP_OPTIONS.foreign;
        if (field.dimensions.type === "internal") return MAP_OPTIONS.custom;

        throw new Error("Unrecognized mapping type");
    }

    getAvailableMappingTypes = () => {
        const { field } = this.props;

        const hasForeignKeys = !!field.fk_target_field_id;

        // Only show the "custom" option if we have some values that can be mapped to user-defined custom values
        // (for a field without user-defined remappings, every key of `field.remappings` has value `undefined`)
        const hasMappableNumeralValues =
            field.remapping.size > 0 &&
            [...field.remapping.keys()].every((key) => typeof key === "number" );

        return [
            MAP_OPTIONS.original,
            ...(hasForeignKeys ? [MAP_OPTIONS.foreign] : []),
            ...(hasMappableNumeralValues > 0 ? [MAP_OPTIONS.custom] : [])
        ]
    }

    // dimension-type :type dimension-name :name human_readable_field_id :human_readable_field_i
    onSetMappingType = async (mappingType) => {
        const { field, updateFieldDimension, deleteFieldDimension } = this.props;

        if (mappingType.type === "original") {
            await deleteFieldDimension(field.id)
        } else if (mappingType.type === "foreign") {
            await updateFieldDimension(field.id, {
                type: "external",
                name: field.display_name,
                human_readable_field_id: null
            })
        } else if (mappingType.type === "custom") {
            await updateFieldDimension(field.id, {
                type: "internal",
                name: field.display_name,
                human_readable_field_id: null
            })
        } else {
            throw new Error("Unrecognized mapping type");
        }

        this.setState({ mappingType })
    }

    onForeignKeyFieldChange = async (foreignKeyClause) => {
        const { table, field, fetchTableMetadata, updateFieldDimension } = this.props;

        // TODO Atte Keinänen 7/10/17: Use Dimension class when migrating to metabase-lib
        if (foreignKeyClause.length === 3 && foreignKeyClause[0] === "fk->") {
            await updateFieldDimension(field.id, {
                type: "external",
                name: field.display_name,
                human_readable_field_id: foreignKeyClause[2]
            })

            await fetchTableMetadata(table.id, true);

            this.refs.fkPopover.close()
        } else {
            throw new Error("The selected field isn't a foreign key")
        }

    }

    onUpdateRemappings = async (remappings) => {
        const { field, updateFieldValues } = this.props;
        await updateFieldValues(field.id, Array.from(remappings));
    }

    getForeignKeys = () => {
        const { table, field } = this.props;
        const unfilteredFks = Query.getFieldOptions(table.fields, true).fks
        return unfilteredFks.filter(fk => fk.field.id === field.id);
    }

    render () {
        const { field, table, fields} = this.props;

        const isFKMapping = this.state.mappingType === MAP_OPTIONS.foreign;
        const hasFKMappingValue = isFKMapping && field.dimensions.human_readable_field_id !== null;
        const fkMappingField = hasFKMappingValue && fields[field.dimensions.human_readable_field_id];

        return (
            <div>
                <SectionHeader
                    title='Display values'
                    description="Choose to show the original value from the database, or have this field display associated or custom information."
                />
                <Select
                    className={SelectClasses}
                    value={this.state.mappingType}
                    onChange={this.onSetMappingType}
                    options={this.getAvailableMappingTypes()}
                />
                { this.state.mappingType === MAP_OPTIONS.foreign && [
                    <SelectSeparator key="foreignKeySeparator" />,
                    <PopoverWithTrigger
                        ref="fkPopover"
                        triggerElement={
                            <SelectButton
                                hasValue={hasFKMappingValue}
                                className="border-dark flex inline-block no-decoration h3 p2 shadowed"
                            >
                                {fkMappingField ? fkMappingField.display_name : "Choose a field"}
                            </SelectButton>
                        }
                        isInitiallyOpen={false}
                    >
                        <FieldList
                            className="text-purple"
                            field={fkMappingField}
                            fieldOptions={{ count: 0, fields: [], fks: this.getForeignKeys() }}
                            tableMetadata={table}
                            onFieldChange={this.onForeignKeyFieldChange}
                        />
                    </PopoverWithTrigger>
                ]}
                { this.state.mappingType === MAP_OPTIONS.custom && (
                    <div className="mt3">
                        <ValueRemappings
                            remappings={field && field.remapping}
                            updateRemappings={this.onUpdateRemappings}
                        />
                    </div>
                )}
            </div>
        )
    }
}

