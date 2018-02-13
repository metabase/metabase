import _ from 'underscore'
import React from 'react'
import { connect } from 'react-redux'
import { Box, Flex, Border, Subhead } from 'rebass'
import { Link } from "metabase/spaces/Link"

import {
    getCurrentSpace,
    getTablesForDB,
} from './selectors'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state),
        tables: getTablesForDB(state)
    }
}

@connect(mapStateToProps)
export class Tables extends React.Component {
    render() {
        const { tables } = this.props

        const sorted = _.groupBy(
            tables,
            (item) => {
                return item.display_name.toUpperCase().substr(0,1)
            }
        )

        return (
            <Box>
                <Flex wrap>
                    { Object.keys(sorted).map(key => {
                        // const size = sorted[key].length > 10 ? '3/3' : '1/3'
                        return (
                            <Box w={2/3, 1/3} p={2} mb={2} key={key}>
                                <Border bottom pb={2}>
                                    <Subhead>{key}</Subhead>
                                </Border>
                                <Flex wrap pt={2}>
                                    { sorted[key].map(d => {
                                        return (
                                            <Box w={1/3} p={1} key={d.id}>
                                                <Link to='Table' params={{ id: d.id}}>
                                                    {d.display_name}
                                                </Link>
                                            </Box>
                                        )
                                    })}
                                </Flex>
                            </Box>
                        )
                    })}
                </Flex>
            </Box>
        )
    }
}

