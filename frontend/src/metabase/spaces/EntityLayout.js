import React from 'react'
import { connect } from 'react-redux'
import { Link } from "react-router"
import { Absolute, Box, ButtonOutline, Card, Flex, Heading, Relative, Subhead } from 'rebass'

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper"

export const InterestText = ({ children }) =>
    <p style={{ color: '#93A1AB', lineHeight: '1.6em' }}>
        { children }
    </p>

// decide if something's on screen or not
export const diceRoll = () => Math.random() >= 0.5

export const Token = ({ children }) =>
    <Card px={4} py={3} style={{ borderRadius: 99, flex: 1 }}>
        { children }
    </Card>

export const ModifyOption = ({ option, itemType, space }) => {
    let params = {
        id: option.id
    }
    if(space) {
        params.space = space.slug
    }
    return (
        <Token>
            <Link to={itemType} params={params}>
                { option.display_name || option.name }
            </Link>
        </Token>
    )
}

export const ModifyOptions = ({ options, itemType, space }) =>
    <Flex wrap>
        { options.map(o => <Box mr={2} mb={2}><ModifyOption option={o} itemType={itemType} space={space} /></Box>)}
    </Flex>

export const ModifyHeader = ({ children }) =>
    <h3 style={{ color: '#93A1AB' }}>{ children }</h3>

export const ModifySection = ({ children }) =>
    <Box my={3} py={3}>
        { children }
    </Box>

export const Owner = () =>
    <Flex mb={4} align='center'>
        <Flex align='center' justify='center' w={40} mr={2} style={{ height: 40, border: '2px solid #509ee3', borderRadius: 99 }}>
            KD
        </Flex>
        <h3>Kyle Doherty</h3>created this
    </Flex>

export class ShareMenu extends React.Component {
    state = {
        open: false
    }
    render () {
        return (
            <Menu name='Share'>
                <Box my={3}>
                    <Link>Add to dashboard</Link>
                </Box>
                <Box my={3}>
                    <Link>Download results</Link>
                </Box>
                <Box my={3}>
                    <Link>Sharing and embedding</Link>
                </Box>
            </Menu>
        )
    }
}

export class Menu extends React.Component {
    state = {
        open: false
    }
    handleToggle() {
        this.setState({ open: !this.state.open})
    }
    render () {
    const { name, children } = this.props
        return (
            <OnClickOutsideWrapper handleDismissal={() => this.setState({ open: false })}>
                <Relative>
                    <div onClick={() => this.setState({ open: true })}>
                        { name }
                    </div>
                    { this.state.open && (
                        <Absolute top={20} right>
                            <Card w={200}>
                                { children }
                            </Card>
                        </Absolute>
                    )}
                </Relative>
            </OnClickOutsideWrapper>
        )
    }
}
