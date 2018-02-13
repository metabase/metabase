import React from 'react'
import { Link } from "metabase/spaces/Link"
import { Absolute, Box, Flex } from 'rebass'
import { Burger } from 'reline'
import Icon from 'metabase/components/Icon'

import SpaceHomeLink from './SpaceHomeLink'

const Header = () => {
    return (
        <Flex mb={3} z={4}>
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
            <Box ml='auto' py={3}>
                <Icon name='search' />
            </Box>
        </Flex>
    )
}

export default Header
