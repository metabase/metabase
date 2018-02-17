import React, { Component } from 'react'
import { Link } from "metabase/spaces/Link"
import { connect } from 'react-redux'
import { normal } from 'metabase/lib/colors'

import Icon from 'metabase/components/Icon'

import { Absolute, Box, Card, Flex, Subhead } from 'rebass'

import { Wrapper, Section, SectionHeading, PageHeading } from './layouts/shared'

import {
    getCurrentSpace,
    getMetricsForSpace,
    getImportantSegmentsForSpace,
    getLogsForSpace
} from './selectors'

import { SPACES } from "metabase/spaces/fixtures";
import { loadEntities } from "metabase/questions/questions";

const GuideLink = ({ to, title, space, color, icon }) => {
    return (
        <Card
            w={1/3}
            p={3}
            mx={2}
            bg={color}
            color='white'
        >
            <Link to={to} params={{ space }}>
                <Flex p={2} style={{ height: 180 }} direction='column' align='center' justifyContent='center' alignItems='center'>
                    <Box>
                        {icon}
                    </Box>
                    <Subhead>{title}</Subhead>
                </Flex>
            </Link>
        </Card>
    )
}

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
export class Guide extends Component {
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

        // NOTE Atte Keinänen 2/5/18: Simple hack for displaying a warning
        // while still keeping the router paths and component code in place
        if (!currentSpace) {
            return <h3>This section isn't demoable yet</h3>
        }

        const dashHeight = 700
        const hasPinnedDash = currentSpace.pinnedDashId !== null
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

                    <PageHeading
                        icon={<Icon name='all' size={32} />}
                        title={currentSpace.name}
                    />

                    <Section>
                        <Flex>
                            <GuideLink
                                to='Shared'
                                title='Dashboards & Pulses'
                                space={params.space}
                                color={normal.blue}
                                icon={<Icon name='dashboard' size={40}/>}
                            />

                            <GuideLink
                                to='Metrics'
                                title='Metrics'
                                space={params.space}
                                color={normal.green}
                                icon={<Icon name='insight' size={40}/>}
                            />
                            <GuideLink
                                to='Segments'
                                title='Segments'
                                space={params.space}
                                color={normal.indigo}
                                icon={<Icon name='segment' size={40}/>}
                            />
                            <GuideLink
                                to='Questions'
                                title='Questions'
                                space={params.space}
                                color={normal.blue}
                                icon={<Icon name='insight' size={40}/>}
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

