import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"
import Modal from "metabase/components/Modal";
import Icon from 'metabase/components/Icon'
import { normal } from 'metabase/lib/colors'

import { Box, ButtonOutline, Button, Card, Flex, Subhead } from 'rebass'

import {
    Section,
    SectionHeading,
    PageHeading,
    PageLayout
} from './layouts/shared'

import {
    //getMetricsForSpace,
    getCurrentSpace
} from './selectors'

import { getMetrics } from 'metabase/selectors/metadata'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        metrics: getMetrics(state),
        spaces: state._spaces.spaces
    }
}

const PinnedMetric = ({ metric }) =>
    <Link>
        <Card bg={normal.green} color='white' radius={6} p={4}>
            <Flex align='center'>
                <Icon name='insight' size={32} />
                <Box ml={2}>
                    <h2>{ metric.name }</h2>
                </Box>
                { metric.favorite && (
                    <Box ml='auto'>
                        <Icon name='star' color={normal.yellow} size={22} />
                    </Box>
                )}
            </Flex>
        </Card>
    </Link>

const MetricListItem = ({ metric }) =>
    <Link>
        <Box>
            <Flex align='center'>
                <Flex align='center' justifyContent='center' p={2} bg='#F4F5F6'>
                    <Icon name='insight' size={20} color={normal.green} />
                </Flex>
                <Box ml={2}>
                    <h2>{ metric.name }</h2>
                </Box>
            </Flex>
        </Box>
    </Link>

@connect(mapStateToProps)
export class Metrics extends Component {
    state = {
        showModal: false
    }
    render () {
        const { metrics, space, spaces } = this.props

        // NOTE Atte Keinänen 2/5/18: Simple hack for displaying a warning
        // while still keeping the router paths and component code in place
        if (!space) {
            return <h3>This section isn't demoable yet</h3>
        }


        return (
            <PageLayout>

                <PageHeading
                    icon={<Icon name='insight' color={normal.green} size={42} />}
                    title='Metrics'
                />

                <Section>
                    <SectionHeading>Pinned metrics</SectionHeading>
                    <Flex wrap mt={4}>
                        <Box w={1/2} mb={2}>
                            <PinnedMetric metric={{ name: 'Test', favorite: true, }} />
                        </Box>
                        <Box w={1/2} mb={2}>
                            <PinnedMetric metric={{ name: 'Test 2', favorite: false,}} />
                        </Box>
                        <Box w={1/2} mb={2}>
                            <PinnedMetric metric={{ name: 'Test 3', favorite: false }} />
                        </Box>
                    </Flex>
                </Section>
                <Section>
                    <SectionHeading>Other metrics</SectionHeading>
                    <Box>
                        <Box mb={2}>
                            <MetricListItem metric={{ name: 'Test' }} />
                        </Box>
                        <Box mb={2}>
                            <MetricListItem metric={{ name: 'Test 2' }} />
                        </Box>
                        <Box mb={2}>
                            <MetricListItem metric={{ name: 'Test 3' }} />
                        </Box>
                    </Box>
                </Section>

                <Modal
                    isOpen={this.state.showModal}
                >
                    <Flex>
                        <Box onClick={() => this.setState({ showModal: false })} ml='auto'>
                            Close
                        </Box>
                    </Flex>
                    <Subhead>Spaces</Subhead>
                    { spaces.map(s =>  {
                        return (
                            <Flex align='center'>
                                { s.name }
                                <ButtonOutline ml='auto'>
                                    { s.id === space.id ? 'Remove' : 'Add' }
                                </ButtonOutline>
                            </Flex>
                        )
                    })}
                    <Button onClick={() => this.setState({ showModal: false })}>
                        Done
                    </Button>
                </Modal>
            </PageLayout>
        )
    }
}

