import React from 'react'
import { Box } from 'rebass'

import Header from '../Header'
import { Wrapper } from './shared'

const Space = ({ children }) =>
    <Box mt={4} pt={4}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 }}>
            <Header />
        </div>
        <Wrapper>
            { children }
        </Wrapper>
    </Box>
        
export default Space
