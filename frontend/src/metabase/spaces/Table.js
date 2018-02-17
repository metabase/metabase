import React from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"
import { Box, Button, ButtonOutline, Card, Flex, Heading, Input, Subhead, } from 'rebass'
import faker from 'faker'
import { FakeTable } from './FakeTable'

import { Wrapper } from './layouts/shared'

import Select from 'metabase/components/Select'
import Modal from "metabase/components/Modal";

import {
    diceRoll,
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

@connect(mapStateToProps)
export class Table extends React.Component {
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
        const { spaces, metrics, table, connectedTables, showQB, segments, time, scalar } = this.props
        console.log('segments')
        return (
            <Box>
                <Box mt={4}>
                    <Box>
                        <Box background='' p={2}>
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
                            <Card style={{ height: 600, overflow: 'scroll' }}>
                                { this.renderViz() }
                            </Card>
                        </Box>
                        <Wrapper>
                            <Box w={2/3} mt={2}>
                                <Heading my={4}>
                                    { table.display_name }
                                </Heading>
                                <p>{ table.description }</p>
                                <Box>
                                    <Box mt={4}>
                                        <Subhead>Learn about this</Subhead>
                                        <InterestText>Each row represents a time when a Metabase instance accessed one of our hosted static assets.</InterestText>
                                    </Box>
                                    <Box>
                                        <Box mt={4} w={'80%'}>
                                            <h3>Why this table is interesting</h3>
                                            <InterestText>A lot of different metrics can be derived from this table: invite email views, count of instances phoning home (i.e., active instances), and downloads.</InterestText>
                                        </Box>
                                        <Box mt={4} w={'80%'}>
                                            <h3>Things to be aware of</h3>
                                            <InterestText>There is some weirdness in how you have to filter this table in order to get the metric you want. Also note that instances check in twice per day, so if you do a count of rows to determine active instances, make sure to divide it by 2.</InterestText>
                                        </Box>
                                    </Box>

                                </Box>
                            </Box>
                            { !showQB && (
                                <Box>
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
                        </Wrapper>
                    </Box>
                </Box>
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


