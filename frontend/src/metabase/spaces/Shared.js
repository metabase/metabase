import React from 'react'
import { connect } from 'react-redux'
import { Box, Button, ButtonOutline, Card, Flex, Heading, Subhead } from 'rebass'
import { Link } from "react-router"

import Modal from "metabase/components/Modal";

import {
    getDashboardsForSpace,
    getPulsesForSpace
} from './selectors'

const mapStateToProps = (state) => {
    return {
        dashboards: getDashboardsForSpace(state),
        pulses: getPulsesForSpace(state)
    }
}

class Shared extends React.Component {
    state = {
        showDashModal: false
    }
    render () {
        const { params, dashboards, pulses } = this.props
        return (
            <div>
                <Flex>
                    <Box w={2/3}>
                        <Flex>
                            <Box>
                                <Heading>Dashboards</Heading>
                            </Box>
                            <Box ml='auto'>
                                <Button onClick={() => this.setState({ showDashModal: true })}>
                                    New dashboard
                                </Button>
                            </Box>
                        </Flex>
                        <Flex wrap>
                            { dashboards && dashboards.map(d =>
                                <Box w={1/3} key={d.id} p={4}>
                                    <Card p={3}>
                                        <Link to='Dashboard' params={{ id: d.id, space: params.space }}>
                                            <Subhead>{d.name}</Subhead>
                                        </Link>
                                    </Card>
                                </Box>
                            )}
                        </Flex>
                    </Box>
                    <Box w={1/3} px={4}>
                        <Flex align='center'>
                            <Subhead>Pulses</Subhead>
                            <ButtonOutline ml='auto'>New pulse</ButtonOutline>
                        </Flex>
                        <ol>
                            { pulses && pulses.map(p => <li>{p.name}</li>) }
                        </ol>
                    </Box>
                </Flex>
                <Modal 
                    isOpen={this.state.showDashModal}
                >
                    NEW DASH
                </Modal>
            </div>
        )
    }
}

export default connect(mapStateToProps)(Shared)
