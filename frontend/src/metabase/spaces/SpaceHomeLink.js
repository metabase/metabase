import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { getCurrentSpace } from './selectors'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state)
    }
}


const SpaceHomeLink = ({ space }) =>
    space ? (
        <Link to={`/_spaces/${space.slug}/guide`}>
            { space.name }
        </Link>
    ) : null

export default connect(mapStateToProps)(SpaceHomeLink)
