import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"
import Icon from 'metabase/components/Icon'
import { normal } from 'metabase/lib/colors'

import {
    getCurrentSpace,
    getSegmentsForSpace
} from './selectors'

import {
    Section,
    SectionHeading,
    PageHeading,
    PageLayout
} from './layouts/shared'

import { Box, Card, Flex, Subhead } from 'rebass'


const mapStateToProps = (state) => {
    const segments = getSegmentsForSpace(state)
    const space = getCurrentSpace(state)
    return {
        segments,
        space
    }
}

const SEGMENT_COLOR = normal.indigo

const PinnedSegment = ({ segment }) =>
    <Link>
        <Card bg={SEGMENT_COLOR} color='white' radius={6} p={4}>
            <Flex align='center'>
                <Icon name='insight' size={32} />
                <Box ml={2}>
                    <h2>{ segment.name }</h2>
                </Box>
                { segment.favorite && (
                    <Box ml='auto'>
                        <Icon name='star' color={normal.yellow} size={22} />
                    </Box>
                )}
            </Flex>
        </Card>
    </Link>

const SegmentListItem = ({ segment, to, params }) =>
    <Link to={to} params={params}>
        <Box>
            <Flex align='center'>
                <Flex align='center' justifyContent='center' p={2} bg='#F4F5F6'>
                    <Icon name='insight' size={20} color={SEGMENT_COLOR} />
                </Flex>
                <Box ml={2}>
                    <h2>{ segment.name }</h2>
                </Box>
            </Flex>
        </Box>
    </Link>

@connect(mapStateToProps)
export class Segments extends Component {
    render() {
        const { segments, space } = this.props

        // NOTE Atte Keinänen 2/5/18: Simple hack for displaying a warning
        // while still keeping the router paths and component code in place
        if (!space) {
            return <h3>This section isn't demoable yet</h3>
        }

        return (
            <PageLayout>
                <PageHeading
                    icon={<Icon name='segment' color={SEGMENT_COLOR} size={22} />}
                    title="Segments"
                />

                <Section>
                    <SectionHeading>Pinned segments</SectionHeading>
                    <Flex wrap>
                        <Box w={1/2}>
                            <PinnedSegment segment={{ name: 'Test Segment', favorite: true }} />
                        </Box>
                        <Box w={1/2}>
                            <PinnedSegment segment={{ name: 'Test Segment', favorite: false }} />
                        </Box>
                        <Box w={1/2}>
                            <PinnedSegment segment={{ name: 'Test Segment', favorite: false}} />
                        </Box>
                        <Box w={1/2}>
                            <PinnedSegment segment={{ name: 'Test Segment', favorite: true }} />
                        </Box>
                        <Box w={1/2}>
                            <PinnedSegment segment={{ name: 'Test Segment', favorite: false }} />
                        </Box>
                    </Flex>
                </Section>

                <Section>
                    <SectionHeading>Other segments</SectionHeading>
                    { segments.map(s =>
                        <Box mb={2}>
                            <SegmentListItem
                                segment={s}
                                to='Segement'
                                params={{ space: space.slug, id: s.id }}
                            />
                        </Box>
                    )}
                </Section>


            </PageLayout>
        )
    }
}
