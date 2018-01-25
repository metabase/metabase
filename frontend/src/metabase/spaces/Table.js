import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { Absolute, Box, Button, ButtonOutline, Card, Flex, Heading, Input, Relative, Subhead } from 'rebass'
import faker from 'faker'
import FakeTable from './FakeTable'

import Select from 'metabase/components/Select'
import Modal from "metabase/components/Modal";

import {
    diceRoll,
    ModifyOption,
    ModifyHeader,
    ModifyOptions,
    ModifySection,
    InterestText,
    Token,
    Menu
} from './EntityLayout'

import {
    getTableById
} from './selectors'

const mapStateToProps = (state) => {
    const table = getTableById(state)
    const tables = state._spaces.tables
    const segments = state._spaces.segments.filter(s => s.table_id === table.id).slice(0, 3)
    const metrics = state._spaces.metrics.filter(m => m.table_id === table.id)
    const connectedTables = state._spaces.tables.filter(t => t.db.id === table.db.id).slice(0, 4)

    return {
        table,
        related: faker.random.arrayElement(tables),
        metrics,
        segments,
        connectedTables,
        showQB: state.params.qb,
        scalar: state.params.scalar,
        time: state.params.time,
        spaces: state._spaces.spaces,
        edit: state.params.edit
    }
}

class EditMenu extends React.Component {
    state = {
        open: false
    }

    render () {
        return (
            <Relative>
                <div onClick={() => this.setState({ open: true })}>
                    Edit
                </div>
                { this.state.open && (
                    <Absolute top={20} right={0}>
                        <Card>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                        </Card>
                    </Absolute>
                )}
            </Relative>
        )
    }
}

class ShareMenu extends React.Component {
    state = {
        open: false
    }
    render () {
        return (
            <Box>
                <div onClick={() => this.setState({ open: true })}>
                    Share
                </div>
                { this.state.open && (
                    <Card>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                    </Card>
                )}
            </Box>
        )
    }
}
class Table extends React.Component {
    state = {
        showSave: false,
        selectedSpaces: ''
    }
    renderViz () {
        const { scalar, time } = this.props
        if(scalar) {
            return <Heading>31</Heading>
        }
        if(time) {
            return <img src={'app/assets/_spaces/time_series_chart.png'} style={{ width: '100%', height: '100%' }} />
        }
        return <FakeTable />
    }
    selectSpaces = (selection) => {
        this.setState({ selectedSpaces: selection })
    }
    render () {
        const { space, spaces, metrics, table, connectedTables, showQB, segments, time, scalar } = this.props
        console.log('segments')
        return (
            <Box>
                <Flex mb={4} mt={2}>
                    <Heading>
                        { scalar && "Count of" }{ table.display_name} { time && "over time" }
                    </Heading>
                    <Flex ml='auto' align='center'>
                        { (showQB || time || scalar) && (
                            <Box mx={3}>
                                <ButtonOutline onClick={() => this.setState({ showSave: true })}>Save</ButtonOutline>
                            </Box>
                        )}
                        <Box mx={3}>
                            <ShareMenu />
                        </Box>
                        <Box mx={3}>
                            <Menu name='More'>
                                <Box my={3}>
                                    <Link to='Metadata' params={{ id: table.id }}>
                                        Metadata
                                    </Link>
                                </Box>
                            </Menu>
                        </Box>
                    </Flex>
                </Flex>

                {showQB && (
                    <Flex>
                        <img src={'app/assets/_spaces/query_builder_raw_data.png'} />
                        <Link to='TTime' params={{ id: table.id, time: 't/time'}}>
                            <Button>Done</Button>
                        </Link>
                    </Flex>
                )}

                <Flex mt={4}>
                    <Box w={showQB ? 3/3 : 2/3}>
                        <Card style={{ height: 600, overflow: 'scroll' }}>
                            { this.renderViz() }
                        </Card>
                        { !showQB && (
                            <Box>
                                { segments.length > 0  && (
                                    <ModifySection>
                                        <ModifyHeader>
                                            {
                                                (!time && !scalar) ? 'Segments of this table' : 'Filter by a segment'
                                            }
                                        </ModifyHeader>
                                        <Flex>
                                            { segments.map(s => {
                                                const space = spaces.filter(space => space.id === s.spaces[0])[0]
                                                console.log(space)
                                                return (
                                                    space ? (
                                                    <Token>
                                                        <Link to='Segment' params={{ id: s.id, space: space.slug }}>
                                                            {s.name}
                                                        </Link>
                                                    </Token>
                                                    ) : (null)

                                                )
                                            })}
                                        </Flex>
                                    </ModifySection>
                                )}
                                { metrics.length > 0 &&  (
                                    <ModifySection>
                                        <ModifyHeader>
                                            { (time || scalar) ? "Related metrics" : "Metrics based on this table" }</ModifyHeader>
                                        <Flex>
                                            { metrics.map(m => {
                                                const space = spaces.filter(space => space.id === m.spaces[0])[0]
                                                console.log(space)
                                                return (
                                                    <Token>
                                                        <Link to='Metric' params={{ id: m.id, space: space.slug }}>
                                                            {m.name}
                                                        </Link>
                                                    </Token>

                                                )
                                            })}
                                        </Flex>
                                    </ModifySection>
                                )}
                                { (!time && !scalar) && (
                                    <Box>
                                        <ModifySection>
                                            <ModifyHeader>Potentially interesting questions</ModifyHeader>
                                            <Flex>
                                                <Box mx={3}>
                                                    <Token>
                                                        <Link to='TScalar' params={{ id: table.id, scalar: 'scalar' }}>
                                                            Total
                                                        </Link>
                                                    </Token>
                                                </Box>
                                                <Box mx={3}>
                                                    <Token>
                                                        <Link to='TTime' params={{ id: table.id, time: 'time' }}>
                                                            View count over time
                                                        </Link>
                                                    </Token>
                                                </Box>
                                            </Flex>
                                        </ModifySection>
                                        { connectedTables && (
                                            <ModifySection>
                                                <ModifyHeader>Connected tables</ModifyHeader>
                                                <ModifyOptions
                                                    options={connectedTables}
                                                    itemType='Table'
                                                />
                                            </ModifySection>
                                        )}
                                    </Box>
                                )}

                            </Box>
                        )}
                    </Box>
                    { !showQB && (
                        <Box w={1/3} mx={4} px={4}>
                            {!showQB && (
                                <Link to='QB' params={{ id: table.id, qb: 'qb' }}>
                                    <ButtonOutline>
                                        { time || scalar ? 'Query builder' : 'Ask a question about this' }
                                    </ButtonOutline>
                                </Link>
                            )}
                            <Box mt={4}>
                                <Subhead>Learn about this</Subhead>
                                <p>Each row represents a time when a Metabase instance accessed one of our hosted static assets.</p>
                            </Box>
                            { (!time && !scalar) && (
                                <Box>
                                    { diceRoll() && (
                                        <Box mt={4} w={'80%'}>
                                            <h3>Why this table is interesting</h3>
                                            <InterestText>A lot of different metrics can be derived from this table: invite email views, count of instances phoning home (i.e., active instances), and downloads.</InterestText>
                                        </Box>
                                    )}
                                    { diceRoll() && (
                                        <Box mt={4} w={'80%'}>
                                            <h3>Things to be aware of</h3>
                                            <InterestText>There is some weirdness in how you have to filter this table in order to get the metric you want. Also note that instances check in twice per day, so if you do a count of rows to determine active instances, make sure to divide it by 2.</InterestText>
                                        </Box>
                                    )}
                                </Box>
                            )}

                            { (time || scalar) && (
                                <Box>
                                    <Box my={2}>
                                        <h3>Table this is based on</h3>
                                    </Box>
                                    <Flex>
                                        <Token>
                                            <Link to='Table' params={{ id: table.id }}>
                                                { table.display_name }
                                            </Link>
                                        </Token>
                                    </Flex>
                                </Box>
                            )}
                        </Box>
                    )}
                </Flex>
                <Modal isOpen={this.state.showSave} style={{ content: { width: 620, marginLeft: 'auto', marginRight: 'auto', height: 800}}}>
                    <Flex aling='center'>
                        <Heading>Save</Heading>
                        <Box ml='auto' onClick={() => this.setState({ showSave: false })}>
                            Close
                        </Box>
                    </Flex>
                    <Box>
                        <h4>Name</h4>
                        <Input placeholder='Name your question' />
                    </Box>

                    <Box>
                        <h4>Description</h4>
                        <Input placeholder="It's optional but oh so helpful" />
                    </Box>

                    <Box>
                        <h4>Where should this question live?</h4>
                        <Select
                            value={this.state.selectedSpaces}
                            options={spaces.map(s => ({ value: s.slug, name: s.name }))}
                            multi={true}
                            search={false}
                            clearable={false}
                            onChange={this.selectSpaces}
                        />
                    </Box>

                    <Flex align='center'>
                        <Link to='Question' params={{ id: 3, space: 'growth' }}>
                            <Button ml='auto' onClick={() => this.setState({ showSave: false })}>
                                Save
                            </Button>
                        </Link>
                    </Flex>
                </Modal>

            </Box>
        )
    }
}

export default connect(mapStateToProps)(Table)
