import React from 'react'
import { Link } from "metabase/spaces/Link"
import { connect } from 'react-redux'

import { Absolute, Border, Box, Card, Flex, Heading, Relative, Subhead } from 'rebass'

import { Wrapper } from './layouts/shared'

import { 
    getCurrentSpace,
    getMetricsForSpace,
    getImportantSegmentsForSpace,
    getLogsForSpace
} from './selectors'

import {
    Menu
} from './EntityLayout'
import { Component } from "react/lib/ReactBaseClasses";
import { SPACES } from "metabase/spaces/fixtures";
import { loadEntities } from "metabase/questions/questions";

const MoreMenu = ({ id, space }) =>
    <Menu name='More'>
        <Box my={3}>
            <Link>Permissions</Link>
        </Box>
    </Menu>


class EditMenu extends React.Component {
    render () {
        const { id, space } = this.props
        return (
            <Menu name='Edit'>
                <Box my={3}>
                    <Link>Edit collection details</Link>
                </Box>
                <Box my={3}>
                    <Link>Archive</Link>
                </Box>
            </Menu>
        )
    }
}

const GuideLink = ({ to, title, space }) => {
    return (
        <Card w={1/3} p={3} mx={2}>
            <Link to={to} params={{ space }}>
                <Flex p={2} style={{ height: 180 }} direction='row' align='self-end'>
                    <Subhead>{title}</Subhead>
                </Flex>
            </Link>
        </Card>
    )
}
const Section = ({ children }) => 
    <Box py={4}>
        { children }
    </Box>

const SectionHeading = ({ children, allLink }) => 
    <Border bottom mb={3} pb={2}>
        <Flex align='center'>
            <Subhead>{ children }</Subhead>
        </Flex>
    </Border>


const mapStateToProps = (state) => {
    // temporary override for having a mixture of real and fixture data
    const stateWithFixtureSpace = {
        ...state,
        params: {
            ...state.params,
            space: SPACES[2].slug
        }
    }

    return {
        logs: getLogsForSpace(stateWithFixtureSpace).slice(0, 8),
        currentSpace: getCurrentSpace(stateWithFixtureSpace),
        // this should actually just be called important
        recents: getMetricsForSpace(stateWithFixtureSpace).slice(0, 8),
        segments: getImportantSegmentsForSpace(stateWithFixtureSpace).slice(0, 5),
        questions: []
    }
}

@connect(mapStateToProps, { loadEntities })
export default class Guide extends Component {
    componentWillMount() {
        // load all questions already?
        this.props.loadEntities("cards", {f: "all", collection: "", ...location.query});
    }

    render() {
        const {
            params,
            currentSpace,
            recents,
            segments,
            logs,
            questions
        } = this.props

        const dashHeight = 700
        const hasPinnedDash = currentSpace.pinnedDashId !== null
        console.log(logs)
        return (
            <div>
                { hasPinnedDash && (
                    <Absolute top left right bg='#F4F5F6' z={1}>
                        <div style={{ height: dashHeight }}>
                            <Wrapper>
                                PINNED DASHBOARD
                            </Wrapper>
                        </div>
                    </Absolute>
                )}
                <div style={{ marginTop: hasPinnedDash ? dashHeight + 30 : 0 }}>

                    <Flex align='center'>
                        <Heading>{ currentSpace.name } Guide</Heading>
                        { !currentSpace.personal && (
                            <Flex ml='auto' align='center'>
                                <Box mx={2}>
                                    <EditMenu />
                                </Box>
                                <MoreMenu />
                            </Flex>
                        )}
                    </Flex>

                    <Section>
                        <Flex>
                            <GuideLink
                                to='Shared'
                                title='Dashboards & Pulses'
                                space={params.space}
                            />

                            <GuideLink
                                to='Metrics'
                                title='Metrics'
                                space={params.space}
                            />
                            <GuideLink
                                to='Questions'
                                title='Questions'
                                space={params.space}
                            />
                            <GuideLink
                                to='Segments'
                                title='Useful data'
                                space={params.space}
                            />
                        </Flex>
                    </Section>

                    { logs.length > 0 && (
                        <Section>
                            <SectionHeading>Recents</SectionHeading>
                            <Flex>
                                { logs.map((l, i) =>
                                    <Box w={1/10} key={i} flex={1/8} mx={2}>
                                        <Card p={4}>
                                            <Link to={l.itemType} params={{ id: l.item.id, space: currentSpace.slug }}>
                                                <h3>{l.item.name}</h3>
                                            </Link>
                                        </Card>
                                    </Box>
                                )}
                            </Flex>
                        </Section>
                    )}

                    { recents.length > 0 && (
                        <Section>
                            <SectionHeading>Important Metrics</SectionHeading>
                            <Flex>
                                { recents.map(r =>
                                    <Box w={1/10} key={r.id} flex={1/8} mx={2}>
                                        <Card p={4}>
                                            <Link to='Metric' params={{ id: r.id, space: currentSpace.slug }}>
                                                <h3>{r.name}</h3>
                                            </Link>
                                        </Card>
                                    </Box>
                                )}
                            </Flex>
                        </Section>
                    )}

                    { segments.length > 0 && (
                        <Section>
                            <SectionHeading>Important lists</SectionHeading>

                            <Flex>
                                { segments.map(r =>
                                    <Box w={1/10} key={r.id} flex={1/8} mx={2}>
                                        <Card p={4}>
                                            <Link to='Segment' params={{ id: r.id, space: currentSpace.slug }}>
                                                <h3>{r.name}</h3>
                                            </Link>
                                        </Card>
                                    </Box>
                                )}
                            </Flex>
                        </Section>
                    )}

                    { questions.length > 0 && (
                        <Section>
                            <SectionHeading>Pinned questions</SectionHeading>
                        </Section>
                    )}
                </div>
            </div>
        )
    }
}

