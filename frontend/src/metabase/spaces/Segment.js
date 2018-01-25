import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { Absolute, Box, ButtonOutline, Card, Flex, Heading, Relative, Subhead } from 'rebass'

import faker from 'faker'
import FakeTable from './FakeTable'

import {
    diceRoll,
    ModifyOption,
    ModifyHeader,
    ModifyOptions,
    ModifySection,
    InterestText,
    Owner
} from './EntityLayout'

import {
    getSegmentById,
    getCurrentSpace
} from './selectors'

const Badge = () =>
    <img src={'app/assets/_spaces/verified_badge.png'} />

const mapStateToProps = (state) => {
    const segment = getSegmentById(state)
    const tables = state._spaces.tables
    const metrics = state._spaces.metrics
    const source = tables.filter(t => segment.table_id === t.id)[0]
    const space = getCurrentSpace(state)
    const connectedTables = tables.filter(t => t.db.id === source.db.id)
    return {
        segment,
        related: faker.random.arrayElement(tables),
        metric: faker.random.arrayElement(metrics),
        source,
        space,
        connectedTables
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

class MoreMenu extends React.Component {
    state = {
        open: false
    }
    render () {
        return (
            <Relative>
                <div onClick={() => this.setState({ open: true })}>
                    More
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
class Segment extends React.Component {
    render () {
        const { space, metrics, segment, connectedTables, source } = this.props
        return (
            <Box>
                <Flex mb={4} mt={2}>
                    <Flex align='center'>
                        <Badge />
                        <Heading>{segment.name}</Heading>
                    </Flex>
                    <Flex ml='auto' align='center'>
                        <Box mx={3}>
                            <EditMenu />
                        </Box>
                        <Box mx={3}>
                            <ShareMenu />
                        </Box>
                        <Box mx={3}>
                            <MoreMenu />
                        </Box>
                    </Flex>
                </Flex>

                <Flex mt={4}>
                    <Box w={2/3}>
                        <Card style={{ height: 600, overflow: 'scroll' }}>
                            <FakeTable />
                        </Card>
                        { diceRoll() &&  (
                            <ModifySection>
                                <ModifyHeader>Related segments</ModifyHeader>
                                <ModifyOptions
                                    options={[
                                        {
                                            name: 'Installations in USA'
                                        },
                                        {
                                            name: 'Installations in North and Latin America'
                                        },
                                    ]}
                                />
                            </ModifySection>
                        )}
                        { metrics &&  (
                            <ModifySection>
                                <ModifyHeader>Metrics based on this table</ModifyHeader>
                                <ModifyOptions
                                    options={metrics}
                                    itemType='Metric'
                                />
                            </ModifySection>
                        )}
                        <ModifySection>
                            <ModifyHeader>Potentially interesting questions</ModifyHeader>
                            <ModifyOptions
                                options={[
                                    {
                                        name: 'Installations in USA'
                                    },
                                    {
                                        name: 'Installations in USA'
                                    }
                                ]}
                            />
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
                    <Box w={1/3} mx={4} px={4}>
                        <Owner />
                        <Link to='QB' params={{ id: segment.id, qb: 'qb', space: space.slug }}>
                            <ButtonOutline>
                                Ask a question about this
                            </ButtonOutline>
                        </Link>
                        <Box mt={4}>
                            <Subhead>Learn about this</Subhead>
                            <p>Each row represents a time when a Metabase instance accessed one of our hosted static assets.</p>
                        </Box>
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

                            <Box>
                                <h3>Table this is based on</h3>
                                <ModifyOptions options={[source]} itemType='Table' />
                            </Box>
                        </Box>
                    </Box>
                </Flex>
            </Box>
        )
    }
} 

export default connect(mapStateToProps)(Segment)
