import React, { Component } from 'react'
import { Box, ButtonOutline, Flex, Heading } from 'rebass'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"

import { getTableById } from './selectors'

const mapStateToProps = (state) => {
    const table = getTableById(state)
    return {
        table
    }
}

@connect(mapStateToProps)
export class Metadata extends Component {
    render() {
        const { table } = this.props

        return (
            <Box style={{ height: '100vh' }}>
                <Flex align='center' mb={4}>
                    <Heading><Link to='Table' params={{ id: table.id}}>{table.display_name}</Link> metadata</Heading>
                    <ButtonOutline ml='auto'>
                        Edit
                    </ButtonOutline>
                </Flex>
                <img src={'app/assets/_spaces/metadata.png'} />
            </Box>
        )
    }
}
