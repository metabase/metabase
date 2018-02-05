import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Box, ButtonOutline, Card, Flex, Heading } from 'rebass'
import { Link } from "metabase/spaces/Link"

import { getDatabaseByID } from './selectors'
import {
    Menu
} from './EntityLayout'

import { Tables } from './Tables'
import { Editor } from './Editor'

class ShareMenu extends React.Component {
    state = {
        open: false
    }
    render () {
        return (
            <Box>
                <div onClick={() => this.setState({ open: true })}>
                    Share
                </div>
                { this.state.open && (
                    <Card>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                        <Link>Edit</Link>
                    </Card>
                )}
            </Box>
        )
    }
}

const mapStateToProps = (state) => {
    const db = getDatabaseByID(state)
    return {
        db,
        sql: state.params.sql
    }
}

@connect(mapStateToProps)
export class Database extends Component {
    render() {
        const { db, sql } = this.props
        return (
            <Box>
                <Flex align='center'>
                    <Flex align='center' width={'100%'}>
                        <Heading>
                            { db.name }
                        </Heading>
                        { sql && (
                            <Flex ml='auto' align='center'>
                                <Box mx={3}>
                                    <ButtonOutline>Save</ButtonOutline>
                                </Box>
                                <Box mx={3}>
                                    <ShareMenu />
                                </Box>
                                <Box mx={3}>
                                    <Menu name='More'>
                                        <Box my={3}>
                                            <Link to='Metadata' params={{ id: '4' }}>
                                                Metadata
                                            </Link>
                                        </Box>
                                    </Menu>
                                </Box>
                            </Flex>

                        )}
                    </Flex>

                    { !sql && (
                        <ButtonOutline ml='auto'>
                            <Link to='SQL' params={{ id: db.id, sql: 'sql' }}>
                                New SQL
                            </Link>
                        </ButtonOutline>
                    )}
                </Flex>
                { sql
                    ? <Editor />
                    : <Tables db={db} />
                }
            </Box>
        )
    }
}
