import React from 'react'
import { Box, Button, ButtonOutline, Flex, Heading, Input } from 'rebass'
import { Link } from "react-router"

const NewCollection = () =>
    <Box w={1/3} ml='auto' mr='auto'>
        <Heading>New Collection</Heading>

        <Box>
            <Input placeholder='Collection name' />
        </Box>
        <Box>
            <Input placeholder="What's this colleciton about?" />
        </Box>

        <Flex>
            <Flex ml='auto' align='center'>
                <Box mx={2}>
                    <Link to='Overworld'>
                        <ButtonOutline>Cancel</ButtonOutline>
                    </Link>
                </Box>
                <Link to={`/_spaces/misc/guide`}>
                    <Button>Create</Button>
                </Link>
            </Flex>
        </Flex>
    </Box>


export default NewCollection
