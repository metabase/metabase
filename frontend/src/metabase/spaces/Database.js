import React from 'react'
import { connect } from 'react-redux'
import { Absolute, Box, Button, ButtonOutline, Card, Flex, Heading, Input, Relative, Subhead } from 'rebass'
import { Link } from "react-router"

import { getDatabaseByID } from './selectors'
import {
    Menu
} from './EntityLayout'

import Tables from './Tables'
import Editor from './Editor'

class EditMenu extends React.Component {
    state = {
        open: false
    }

    render () {
        return (
            <Relative>
                <div onClick={() => this.setState({ open: true })}>
                    Edit
                </div>
                { this.state.open && (
                    <Absolute top={20} right={0}>
                        <Card>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                            <Box my={3}>
                                <Link>Edit</Link>
                            </Box>
                        </Card>
                    </Absolute>
                )}
            </Relative>
        )
    }
}

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

const Database = ({ db, sql }) => 
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

export default connect(mapStateToProps)(Database)
