import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link";
import { Box, Button, Card, Flex, Heading, Subhead } from 'rebass'
import { loadCollections } from "metabase/questions/collections";
import { getAllCollections } from "metabase/questions/selectors";

const mapStateToProps = (state, props) => ({
    spaces: getAllCollections(state, props),
    log: state._spaces.log.reverse().slice(0, 15),
    databases: state._spaces.databases
})

@connect(mapStateToProps, { loadCollections })
export class SpacesList extends Component {
    componentWillMount() {
        this.props.loadCollections();
    }
    render() {
        const { databases, spaces } = this.props
        return (
            <Box>
                <Flex align='center' py={3}>
                    <Heading>Hey there, Kyle</Heading>
                </Flex>
                <Box mt={4}>
                    <Flex align='center' py={3}>
                        <Heading>Collections</Heading>
                        <Box ml='auto'>
                            <Link to="/_spaces/collection/new">
                                <Button>New collection</Button>
                            </Link>
                        </Box>
                    </Flex>
                    <Flex wrap>
                        { spaces.map(space => {
                            return (
                                <Box w={1/3} p={3} id={space.id}>
                                    <Link to={`/_spaces/${space.slug}/guide`}>
                                        <Card bg='white' p={3} style={{ height: 200 }}>
                                            <Subhead>{space.name}</Subhead>
                                            <p>{space.description}</p>
                                        </Card>
                                    </Link>
                                </Box>
                            )
                        })}
                    </Flex>
                </Box>

                <Box my={3}>
                    <Subhead>Explore data</Subhead>
                    { databases.map(d =>
                        <Box>
                            <Link to='DB' params={{ id: d.id  }}>
                                <Subhead>{d.name}</Subhead>
                            </Link>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    }
}

