import React from 'react'
import { Box } from 'rebass'


import Header from '../Header'

export const EntityLayout = ({ children }) => {
    return (
        <div>
            <Header />
            <Box>
                { children }
            </Box>
        </div>
    )
}

