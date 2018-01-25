import React from 'react'
import { Link } from "react-router"
import { Absolute, Button, Box, Relative } from 'rebass'

import {
    getQuestion,
    getCurrentSpace
} from './selectors'

import { connect } from 'react-redux'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        question: getQuestion(state)
    }
}

const MetricPublish = ({ space, question }) =>
    <Relative style={{ height: '100vh' }}>
        <Box style={{ overflow: 'hidden', height: 810 }} ml='auto' mr='auto'>
            <img src={'app/assets/_spaces/publish_metric_step_1.png'} alt="a" />
        </Box>
        <Absolute style={{ bottom: 0, right: 0 }}>
            <Link to='MetricDescription' params={{ space: space.slug, id: question.id }} style={{ width: 300, height: 300, display: 'block' }}>
                <Button>Next</Button>
            </Link>
        </Absolute>
    </Relative>


export default connect(mapStateToProps)(MetricPublish)
