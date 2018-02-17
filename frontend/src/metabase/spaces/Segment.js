import React from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"
import { Absolute, Box, ButtonOutline, Card, Flex, Heading, Relative, Subhead } from 'rebass'

import faker from 'faker'
import { FakeTable } from './FakeTable'
import { Wrapper, Canvas } from './layouts/shared'

import {
    diceRoll,
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

@connect(mapStateToProps)
export class Segment extends React.Component {
    render () {
        const { space, metrics, segment, connectedTables, source } = this.props

        // NOTE Atte Keinänen 2/5/18: Simple hack for displaying a warning
        // while still keeping the router paths and component code in place
        if (!space) {
            return <h3>This section isn't demoable yet</h3>
        }

        return (
            <Box>
                <Box>
                    <Canvas>
                        <Card style={{ height: 740, overflow: 'scroll' }}>
                            <FakeTable />
                        </Card>
                    </Canvas>
                    <Wrapper>
                        <Flex>
                            <Box w={2/3}>
                                <Flex align='center'>
                                    <Badge />
                                    <Heading>{segment.name}</Heading>
                                </Flex>

                                <Box>
                                    <Owner />
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
                            </Box>

                            <Box w={1/3}>
                                <Card>
                                    Test
                                </Card>
                            </Box>
                        </Flex>
                    </Wrapper>
                </Box>
            </Box>
        )
    }
}

