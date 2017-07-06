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
import { fetchFieldValues, fetchTableMetadata } from "metabase/redux/metadata";

import Metadata from "metabase/meta/metadata/Metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

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
    fetchTableMetadata,
    fetchFieldValues
}

@connect(mapStateToProps, mapDispatchToProps)
export default class FieldApp extends Component {
    props: {
        databaseId: number,
        tableId: number,
        fieldId: number,
        metadata: Metadata,

        fetchDatabaseMetadata: (number) => Promise<void>,
        fetchTableMetadata: (number) => Promise<void>,
        fetchFieldValues: (number) => Promise<void>
    }

    async componentWillMount() {
        const { tableId, fieldId, fetchTableMetadata, fetchFieldValues } = this.props;

        await fetchTableMetadata(tableId);
        const fieldValues = await fetchFieldValues(fieldId);

        // There is a separate "Save" button for committing custom field remappings so store them to local state
        // Store values as a map for easier manipulation

        this.state = {
            humanReadableValues: _.object(fieldValues.human_readable_values || [])
        }
    }

    render () {
        const { metadata, fieldId, databaseId, tableId } = this.props;
        const field = metadata.fields[fieldId];

        // TODO: How to show a metadata loading error here?
        return (
            <LoadingAndErrorWrapper loading={!field} error={null} noWrapper>
                { () =>
                    <div className="relative">
                        <div className="wrapper wrapper--trim">
                            <BackButton databaseId={databaseId} tableId={tableId} />

                            <Section>
                                <FieldHeader
                                    name={field.name}
                                    description={field.description}
                                />
                            </Section>

                            <Section>
                                <FieldType field={field} />
                            </Section>

                            <Section>
                                <FieldVisibility field={field} />
                            </Section>

                            <Section>
                                <FieldRemapping field={field} />
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

class FieldType extends Component {
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
    render () {
        const { name, description, fieldType } = this.props
        return (
            <div>
                <Input
                    className="h1 AdminInput bordered rounded border-dark block mb1"
                    value={name}
                />
                <Input
                    className="text AdminInput bordered input text-measure block"
                    value={description}
                />
            </div>
        )
    }
}

class ValueMaps extends Component {
    render () {
        const { valueMaps } = this.props
        return (
            <div className="bordered rounded p2 border-dark ">
                <div className="flex align-center my1 pb2 border-bottom">
                    <h3>Original value</h3>
                    <h3 className="ml-auto">Mapped value</h3>
                </div>
                <ol>
                    { valueMaps.map(pair =>
                        <li className="mb1">
                            <FieldValueMapping
                                original={pair.original}
                                mapped={pair.mapped}
                                onSetMap={() => console.log('map') }
                            />
                        </li>
                    )}
                </ol>
                <div className="flex align-center">
                    <Button className="ml-auto" primary>Save</Button>
                </div>
            </div>
        )
    }
}
class FieldValueMapping extends Component {
    render () {
        const { original, mapped, onSetMap } = this.props
        return (
            <div className="flex align-center">
                <h3>{original}</h3>
                <Input
                    className="AdminInput input ml-auto"
                    value={mapped}
                    onChange={onSetMap}
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

const MAP_OPTIONS = [
    { name: 'Use original value' },
    { name: 'Use foreign key' },
    { name: 'Custom mapping' }
]

class FieldRemapping extends Component {
    state = {
        mappingType: MAP_OPTIONS[1]
    }

    render () {
        return (
            <div>
                <SectionHeader
                    title='Display values'
                    description="Choose to show the original value from the database, or have this field display associated or custom information."
                />
                <Select
                    className={SelectClasses}
                    value={this.state.mappingType}
                    onChange={mappingType => this.setState({ mappingType })}
                    options={MAP_OPTIONS}
                />
                { this.state.mappingType === MAP_OPTIONS[1] && [
                    <SelectSeparator />,
                    <Select
                        className={SelectClasses}
                        value={{ name: 'Status name (entity key)' }}
                        options={MAP_OPTIONS}
                    />
                ]}
                { this.state.mappingType === MAP_OPTIONS[2] && (
                    <div className="mt3">
                        <ValueMaps valueMaps={[
                            { original: -1, mapped: 'Returned'  },
                            { original: 1, mapped: 'Processing' },
                            { original: 2, mapped: 'Fulfilled'  },
                        ]}/>
                    </div>
                )}
            </div>
        )
    }
}

