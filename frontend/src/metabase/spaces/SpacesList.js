import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link";
import { Box, Button, Card, Flex, Subhead } from 'rebass'
import { loadCollections } from "metabase/questions/collections";
import { getAllCollections } from "metabase/questions/selectors";
import { getDatabasesList } from "metabase/selectors/metadata";
import { fetchRealDatabases } from "metabase/redux/metadata";

import Icon from 'metabase/components/Icon'

import {
    PageHeading,
    PageLayout,
    PageSidebar
} from './layouts/shared'

const mapStateToProps = (state, props) => ({
    spaces: getAllCollections(state, props),
    log: state._spaces.log.reverse().slice(0, 15),
    databases: getDatabasesList(state)
})

@connect(mapStateToProps, { fetchRealDatabases, loadCollections })
export class SpacesList extends Component {
    componentWillMount() {
        this.props.loadCollections()
        this.props.fetchRealDatabases()
    }
    render() {
        const { databases, spaces } = this.props
        return (
            <Box>
                <Flex mt={4}>
                    <PageLayout>
                        <Flex align='center' py={3} px={2}>
                            <PageHeading
                                icon={<Icon name='all' size={32} />}
                                title="Collections"
                            />
                            <Box ml='auto'>
                                <Link to="/_spaces/collection/new">
                                    <Button>New collection</Button>
                                </Link>
                            </Box>
                        </Flex>
                        <Flex wrap>
                            { spaces.map(space => {
                                return (
                                    <Box w={1/2} px={2} py={1} id={space.id}>
                                        <Link to={`/_spaces/${space.slug}/guide`}>
                                            <Card bg='white' p={4} style={{ height: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                                    <Subhead>{space.name}</Subhead>
                                            </Card>
                                        </Link>
                                    </Box>
                                )
                            })}
                        </Flex>
                    </PageLayout>
                    <PageSidebar>
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
                    </PageSidebar>
                </Flex>
            </Box>
        );
    }
}

