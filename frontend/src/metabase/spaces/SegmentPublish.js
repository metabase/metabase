import React from 'react'
import { Link } from "metabase/spaces/Link"
import { Absolute, Button, Box, Relative } from 'rebass'

import {
    getQuestion,
    getCurrentSpace,
    getSegmentsForSpace
} from './selectors'

import { connect } from 'react-redux'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        question: getQuestion(state),
        segment: getSegmentsForSpace(state)[0]
    }
}

@connect(mapStateToProps)
export class SegmentPublish {
    render() {
        const { space, segment } = this.props
        return (
            <Relative style={{ height: '100vh' }}>
                <Box style={{ overflow: 'hidden', height: 810 }} ml='auto' mr='auto'>
                    <img src={'app/assets/_spaces/publish_segment.png'} alt="a" />
                </Box>
                <Absolute bottom right>
                    <Link to='Segment' params={{ space: space.slug, id: segment.id }} style={{ width: 300, height: 300, display: 'block' }}>
                        <Button>Publish to {space.name}</Button>
                    </Link>
                </Absolute>
            </Relative>
        )
    }
}

