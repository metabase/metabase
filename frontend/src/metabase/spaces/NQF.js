import React from 'react'
import { Box, Flex, Subhead } from 'rebass'

const NQF = () =>
    <Flex align='center' justify='center' style={{ height: '100vh' }}>
        <Flex width={'100%'}>
            <Box w={1/3}>
                <Subhead>Metrics</Subhead>
            </Box>
            <Box w={1/3}>
                <Subhead>Custom</Subhead>
            </Box>
            <Box w={1/3}>
                <Subhead>SQL</Subhead>
            </Box>
        </Flex>
    </Flex>

export default NQF
