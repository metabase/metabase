import React from 'react'
import { Box } from 'rebass'

import { Wrapper } from './shared'

import Header from '../Header'

export const EntityLayout = ({ children }) => {
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

