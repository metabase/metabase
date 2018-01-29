import React from 'react'
import { Link } from "metabase/spaces/Link"
import { Box } from 'rebass'

import { Wrapper } from './shared'

import Header from '../Header'

const Entity = ({ children }) => {
    return (
        <div style={{ height: '100vh' }}>
            <Header />
            <Wrapper>
                <Box>
                    { children }
                </Box>
            </Wrapper>
        </div>
    )
}

export default Entity
