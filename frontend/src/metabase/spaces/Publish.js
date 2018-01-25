import React from 'react'
import { Link } from "react-router"
import { Absolute, Relative } from 'rebass'

import {
    getQuestion,
    getCurrentSpace
} from './selectors'

import { connect } from 'react-redux'

const Publish = ({ space, question }) =>
    <Relative>
        <img src={'app/assets/_spaces/publish.png'} alt="a" />
        <Absolute style={{ top: 300, left: 340 }}>
            <Link to='MetricPublish' params={{ space: space.slug, id: question.id }} style={{ width: 300, height: 300, display: 'block' }}>
            </Link>
        </Absolute>
        <Absolute style={{ top: 300, left: 740 }}>
            <Link to='SegmentPublish' params={{ space: space.slug, id: question.id }} style={{ width: 300, height: 300, display: 'block' }}>
            </Link>
        </Absolute>
    </Relative>


const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        question: getQuestion(state)
    }
}


export default connect(mapStateToProps)(Publish)
