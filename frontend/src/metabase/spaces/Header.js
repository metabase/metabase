import React from 'react'
import { Link } from "react-router"
import { Absolute, Box, ButtonOutline, Flex } from 'rebass'
import { Burger } from 'reline'

import SpaceHomeLink from './SpaceHomeLink'

const Header = () => {
    return (
        <Box mb={3} z={4}>
            <Absolute top left>
                <Flex align='center'>
                    <Link to='Home'>
                        <Box p={3}>
                            <Burger />
                        </Box>
                    </Link>
                    <Box ml={2}>
                        <SpaceHomeLink />
                    </Box>
                </Flex>
            </Absolute>
        </Box>
    )
}

export default Header
