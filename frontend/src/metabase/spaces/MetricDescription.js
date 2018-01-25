import React from 'react'
import { Link } from "react-router"
import { Absolute, Button, Box, Relative } from 'rebass'

import {
    getQuestion,
    getCurrentSpace,
    getMetricsForSpace
} from './selectors'

import { connect } from 'react-redux'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        question: getQuestion(state),
        metric: getMetricsForSpace(state)[0]
    }
}

const MetricDescription = ({ space, question, metric }) =>
    <Relative style={{ height: '100vh' }}>
        <Box style={{ overflow: 'hidden', height: 810 }} ml='auto' mr='auto'>
            <img src={'app/assets/_spaces/publish_metric_step_2.png'} alt="a" />
        </Box>
        <Absolute bottom right>
            <Link to='Metric' params={{ space: space.slug, id: metric.id }} style={{ width: 300, height: 300, display: 'block' }}>
                <Button>Publish to {space.name}</Button>
            </Link>
        </Absolute>
    </Relative>


export default connect(mapStateToProps)(MetricDescription)
