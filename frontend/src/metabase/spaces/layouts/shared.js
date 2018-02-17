import React from 'react'
import { Box, Border, Flex, Subhead, Heading } from 'rebass'

export const Wrapper = ({ children }) =>
    <Box
        w='80%'
        ml='auto'
        mr='auto'
    >
        { children }
    </Box>

export const Canvas = ({ children }) =>
    <Box
        bg='#FCFDFD'
        p={2}
        style={{
            borderTop: '#F4F5F6',
            borderBottom: '#F5F5F6'
        }}
    >
        { children }
    </Box>

export const Section = ({ children }) =>
    <Box py={4}>
        { children }
    </Box>

export const SectionHeading = ({ children }) =>
    <Border bottom mb={3} pb={2}>
        <Flex align='center'>
            <Subhead>{ children }</Subhead>
        </Flex>
    </Border>


export const PageHeading = ({ icon, title }) =>
    <Flex align='center' my={3}>
        {icon}
        <Heading ml={2}>{title}</Heading>
    </Flex>

export const PageLayout = ({ children }) =>
    <Box w={2/3}>
        { children }
    </Box>

export const PageSidebar = ({ children }) =>
    <Box w={1/3}>
        { children }
    </Box>


export const Grid = ({ children, gl, columnWidth }) => {
    console.log(children)
    return (
        <Flex wrap>
            { React.Children.map(children, (child, i) => {
                <Box w={columnWidth} px={gl} key={i}>
                    { React.cloneElement(child) }
                </Box>
            })}
        </Flex>
    )
}

const EntityHeader = ({ children }) =>
    <Box my


