import React, { Component } from 'react'
import { Box, Heading, Subhead } from 'rebass'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"

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
            <Box>
                <Heading>Useful data</Heading>
                { segments.map(s =>
                    <Link to='Segment' params={{ space: space.slug, id: s.id }}>
                        <Subhead>{s.name}</Subhead>
                    </Link>) }
            </Box>
        )
    }
}
