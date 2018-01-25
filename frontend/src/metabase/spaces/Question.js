import { getQuestion, getCurrentSpace } from './selectors'
import { logItem } from './spaces'

import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { Absolute, Box, Button, ButtonOutline, Card, Flex, Heading, Relative, Subhead } from 'rebass'
import faker from 'faker'
import FakeTable from './FakeTable'
import Editor from './Editor'

import {
    diceRoll,
    ModifyOption,
    ModifyHeader,
    ModifyOptions,
    ModifySection,
    InterestText,
    Menu,
} from './EntityLayout'

import {
    getTableById
} from './selectors'

const mapStateToProps = (state) => {

    const question = getQuestion(state)
    const space = getCurrentSpace(state)
    const tables = state._spaces.tables
    //const segments = state._spaces.segments.filter(s => s.table_id === table.id).slice(0, 3)
    //const metrics = state._spaces.metrics.filter(m => m.table_id === table.id)
    //const connectedTables = state._spaces.tables.filter(t => t.db.id === table.db.id).slice(0, 4)

    return {
        question,
        related: faker.random.arrayElement(tables),
        //metrics,
        space,
        //segments,
        //connectedTables,
        showQB: state.params.qb,
        scalar: state.params.scalar,
        time: state.params.time,
        edit: state.params.edit
    }
}

const ShareMenu = ({ id, space }) =>
    <Menu name='Share'>
        <Box my={3}>
            <Link>Add to dashboard</Link>
        </Box>
        <Box my={3}>
            <Link>Download results</Link>
        </Box>
        <Box my={3}>
            <Link>Sharing and embedding</Link>
        </Box>
        <Box my={3}>
            <Link to='Publish' params={{ id, space: space.slug }} >Publish as metric or segment</Link>
        </Box>
    </Menu>


class EditMenu extends React.Component {
    render () {
        const { id, space } = this.props
        return (
            <Menu name='Edit'>
                <Box my={3}>
                    <Link to='QEdit' params={{ id, space: space.slug, edit: 'edit'}}>Edit</Link>
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

class Question extends React.Component {
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
    render () {
        const { space, metrics, question, edit, connectedTables, showQB, segments } = this.props
        const wide = showQB || edit
        return (
            <Box>
                { edit && (
                    <Absolute top left right style={{ height: 40, backgroundColor: '#509ee3', color: 'white' }}>
                        <Flex align='center' p={3}>
                            <Box>Editing</Box>
                            <Box ml='auto'>
                                <Link to='Question' params={{ space: space.slug, id: question.id }}>
                                    <Button bg='white' style={{ color: '#509ee3' }}>
                                        Done
                                    </Button>
                                </Link>
                            </Box>
                        </Flex>
                    </Absolute>
                )}
                <Flex mb={4} mt={2} style={{ marginTop: edit ? 80 : 40 }}>
                    <Heading>
                        { question.name }
                    </Heading>
                    <Flex ml='auto' align='center'>
                        { showQB && (
                            <Box mx={3}>
                                <ButtonOutline>Save</ButtonOutline>
                            </Box>
                        )}
                        { !edit && (
                            <Flex align='center'>
                                <Box mx={3}>
                                    <EditMenu id={question.id} space={space} />
                                </Box>
                                <Box mx={3}>
                                    <ShareMenu id={question.id} space={space} />
                                </Box>
                                <Box mx={3}>
                                    More
                                </Box>
                            </Flex>
                        )}
                        { edit && (
                            <Box mx={3}>
                                Variables
                            </Box>
                        )}
                    </Flex>
                </Flex>

                {showQB && (
                    <Flex>
                        <img src={'app/assets/_spaces/query_builder_raw_data.png'} />
                        <Link to='Question' params={{ id: question.id, space: space.slug}}>
                            <Button>Done</Button>
                        </Link>
                    </Flex>
                )}

                { edit && (
                    <Editor />
                )}

                <Flex mt={4}>
                    <Box w={wide ? 3/3 : 2/3}>
                        <Card style={{ height: 600, overflow: 'scroll' }}>
                            { this.renderViz() }
                        </Card>
                        { !wide && (
                            <Box>
                                <ModifySection>
                                    <ModifyHeader>Potentially interesting questions</ModifyHeader>
                                    <Link to='TScalar' params={{ id: question.id, scalar: 'scalar' }}>
                                        Total 
                                    </Link>
                                    <Link to='TTime' params={{ id: question.id, time: 'time' }}>
                                        View count over time
                                    </Link>
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
                    { !wide && (
                        <Box w={1/3} mx={4} px={4}>
                            {!showQB && (
                                <Link to='QQB' params={{ id: question.id, qb: 'qb', space: space.slug }}>
                                    <ButtonOutline>
                                        Ask a question about this
                                    </ButtonOutline>
                                </Link>
                            )}
                            <Box mt={4}>
                                <Subhead>Learn about this</Subhead>
                                <p>Each row represents a time when a Metabase instance accessed one of our hosted static assets.</p>
                            </Box>
                        </Box>
                    )}
                </Flex>
            </Box>
        )
    }
} 


export default connect(mapStateToProps)(Question)
