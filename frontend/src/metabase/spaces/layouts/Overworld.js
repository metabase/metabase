import React from 'react'
import { Link } from "metabase/spaces/Link"
import { Absolute, Box, Flex } from 'rebass'

import Icon from 'metabase/components/Icon'
import Logo from 'metabase/components/LogoIcon'

import { Wrapper } from './shared'

const User = () =>
    <Link to='Profile'>
        <div style={{ width: 40, height: 40, borderRadius: 99, border: '1px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            KD
        </div>
    </Link>

const ActivityFeed = () =>
    <Link>
        <div style={{ width: 40, height: 40, borderRadius: 99, border: '1px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#509ee3' }}>
            4
        </div>
    </Link>

export const OverworldLayout = ({ children }) =>
    <Box>
        <Logo />
        <Absolute top right p={3}>
            <Flex align='center'>
                <Box mx={2}>
                    <ActivityFeed />
                </Box>
                <Box mx={2}>
                    <User />
                </Box>
                <Box mx={2}>
                    <Icon name='search' />
                </Box>
            </Flex>
        </Absolute>
        <Wrapper>
            { children }
        </Wrapper>
    </Box>

