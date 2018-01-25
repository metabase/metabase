import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { Absolute, Box, Button, ButtonOutline, Card, Flex, Heading, Relative, Subhead } from 'rebass'

import faker from 'faker'
import FakeTable from './FakeTable'

import {
    diceRoll,
    ModifyOption,
    Menu,
    ModifyHeader,
    ModifyOptions,
    ModifySection,
    InterestText,
    Owner,
    ShareMenu,
    Token
} from './EntityLayout'

import {
    getMetricById,
    getCurrentSpace
} from './selectors'

const Badge = () =>
    <img src={'app/assets/_spaces/verified_badge.png'} />

const mapStateToProps = (state) => {
    const metric = getMetricById(state)
    const space = getCurrentSpace(state)
    const source = state._spaces.tables.filter(t => t.id === metric.table_id)[0]
    const metrics = state._spaces.metrics.filter(m => m.table_id === metric.table_id)
    const segments = state._spaces.segments.filter(m => m.table_id === metric.table_id)
    return {
        metric,
        space,
        source,
        metrics,
        showQB: state.params.qb,
        scalar: state.params.scalar,
        time: state.params.time,
        segments,
        filtered: state.params.segmentId
    }
}

class EditMenu extends React.Component {
    render () {
        const { space, id } = this.props
        return (
            <Menu name='Edit'>
                <Box my={3}>
                    <Link>Edit info</Link>
                </Box>
                <Box my={3}>
                    <Link to='QEdit' params={{ space: space.slug, id, edit: 'edit'}}>Edit metric formula</Link>
                </Box>
                <Box my={3}>
                    <Link>Move</Link>
                </Box>
                <Box my={3}>
                    <Link>Archive</Link>
                </Box>
            </Menu>
        )
    }
}

class MoreMenu extends React.Component {
    render () {
        return (
            <Menu name='More'>
                <Box my={3}>
                    <Link>Metadata</Link>
                </Box>
                <Box my={3}>
                    <Link>Get alerts about this</Link>
                </Box>
            </Menu>
        )
    }
}

class Metric extends React.Component {
    render () {
        const { space, metrics, metric, connectedTables, source, showQB, segments, filtered } = this.props
        return (
            <Box>
                <Flex mb={4} mt={2}>
                    <Flex align='center'>
                        <Badge />
                        <Heading>{metric.name} by time { filtered && `filtered by ${segments.filter(s => s.id.toString() === filtered)[0].name}`}</Heading>
                    </Flex>
                    <Flex ml='auto' align='center'>
                        { showQB && (
                            <Box mx={3}>
                                <ButtonOutline>Save</ButtonOutline>
                            </Box>
                        )}
                        <Box mx={3}>
                            <EditMenu id={220} space={space} />
                        </Box>
                        <Box mx={3}>
                            <ShareMenu />
                        </Box>
                        <Box mx={3}>
                            <MoreMenu />
                        </Box>
                    </Flex>
                </Flex>

                {showQB && (
                    <Flex>
                        <img src={'app/assets/_spaces/query_builder_raw_data.png'} />
                        <Link to='Metric' params={{ id: metric.id, space: space.slug}}>
                            <Button>Done</Button>
                        </Link>
                    </Flex>
                )}

                <Flex mt={4}>
                    <Box w={showQB ? 3/3 : 2/3}>
                        <Card style={{ height: 600, overflow: 'scroll' }}>
                            <img src={'app/assets/_spaces/time_series_chart.png'} style={{ width: '100%', height: '100%' }} />
                        </Card>
                        { !showQB && (
                            <Box>
                                { segments.length > 0 && (
                                    <ModifySection>
                                        <ModifyHeader>Filter by a segment</ModifyHeader>
                                        <Flex wrap>
                                        { segments.map(s =>
                                                <Box flex={1}>
                                                    <Token flex={1}>
                                                        <Link to='MFiltered' params={{ id: metric.id, segmentId: s.id, space: space.slug }}>
                                                            { s.name }
                                                        </Link>
                                                    </Token>
                                                </Box>
                                        )}
                                        </Flex>
                                    </ModifySection>
                                )}
                                { diceRoll() &&  (
                                    <ModifySection>
                                        <ModifyHeader>Other ways to view this</ModifyHeader>
                                        <ModifyOptions
                                            options={[
                                                {
                                                    name: 'by Version'
                                                },
                                                {
                                                    name: 'by Country'
                                                },
                                            ]}
                                        />
                                    </ModifySection>
                                )}
                                { metrics && (
                                    <ModifySection>
                                        <ModifyHeader>Related metrics</ModifyHeader>
                                        <ModifyOptions
                                            options={metrics}
                                            itemType='Metric'
                                            space={space}
                                        />
                                    </ModifySection>
                                )}
                            </Box>
                        )}
                    </Box>
                    { !showQB && (
                        <Box w={1/3} mx={4} px={4}>
                            <Owner />
                            <Link to='MQB' params={{ id: metric.id, qb: 'qb', space: space.slug }}>
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
                                        <h3>Why this metric is interesting</h3>
                                        <InterestText>A lot of different metrics can be derived from this table: invite email views, count of instances phoning home (i.e., active instances), and downloads.</InterestText>
                                    </Box>
                                )}
                                { diceRoll() && (
                                    <Box mt={4} w={'80%'}>
                                        <h3>How it's calculated</h3>
                                        <InterestText>There is some weirdness in how you have to filter this table in order to get the metric you want. Also note that instances check in twice per day, so if you do a count of rows to determine active instances, make sure to divide it by 2.</InterestText>
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
                    )}
                </Flex>
            </Box>
        )
    }
}

export default connect(mapStateToProps)(Metric)
