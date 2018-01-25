import React from 'react'
import { Box, Heading, Subhead } from 'rebass'
import { connect } from 'react-redux'
import { Link } from "react-router"

import {
    getCurrentSpace,
    getSegmentsForSpace
} from './selectors'

const mapStateToProps = (state) => {
    const segments = getSegmentsForSpace(state)
    const space = getCurrentSpace(state)
    return {
        segments,
        space
    }
}
const Segments = ({ segments, space }) =>
    <Box>
        <Heading>Useful data</Heading>
        { segments.map(s =>
            <Link to='Segment' params={{ space: space.slug, id: s.id }}>
                <Subhead>{s.name}</Subhead>
            </Link>) }
    </Box>

export default connect(mapStateToProps)(Segments)
