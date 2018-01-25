import React from 'react'
import { Link } from "react-router"
import { Absolute, Box, Flex } from 'rebass'

import { Wrapper } from './shared'

const User = () =>
    <Link to='Profile'>
        <div style={{ width: 40, height: 40, borderRadius: 99, border: '1px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            KD
        </div>
    </Link>

const ActivityFeed = () =>
    <Link>
        <div style={{ width: 40, height: 40, borderRadius: 99, border: '1px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#509ee3', backgroundColor: 'white' }}>
            4
        </div>
    </Link>

const Overworld = ({ children }) =>
    <div>
        <Absolute top right p={3}>
            <Flex align='center'>
                <Box mx={2}>
                    <ActivityFeed />
                </Box>
                <Box mx={2}>
                    <User />
                </Box>
            </Flex>
        </Absolute>
        <Wrapper>
            { children }
        </Wrapper>
    </div>

export default Overworld
