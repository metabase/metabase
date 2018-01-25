import React from 'react'
import { connect } from 'react-redux'
import { Box, Border, Flex, Heading, Subhead } from 'rebass'
import _ from 'underscore'
import { Link } from "react-router"

import {
    getDatabasesForSpace,
    getCurrentSpace
} from './selectors'

function alphabeticallySort (a, b) {
    var nameA = a.name.toUpperCase(); // ignore upper and lowercase
    var nameB = b.name.toUpperCase(); // ignore upper and lowercase
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }
    // names must be equal
    return 0;
}

function forCurrentSpace (space, item) {
    return item.spaces[0] === space.id
}

function dataForCurrentSpace (space, tables) {
    return tables.filter((t) => forCurrentSpace(space, t)).sort(alphabeticallySort)
}

const mapStateToProps = (state) => {
    const { _spaces } = state
    return {
        space: getCurrentSpace(state),
        databases: getDatabasesForSpace(state)
    }
}

const Database = ({ database, space }) =>
    <Border top py={4}>
        <Link to={`/_spaces/db/${database.id}`}>
            <Subhead>{ database.name }</Subhead>
        </Link>
        <p>{ database.description }</p>
    </Border>

const Data = ({ databases, space }) => {
    return (
        <Box w={2/3}>
            <Heading py={3}>
                Data
            </Heading>
            <Box mt={4}>
                { databases.map(d => <Database database={d} key={d.id} space={space} />) }
            </Box>
        </Box>
    )
}

export default connect(mapStateToProps)(Data)
