import React from 'react'
import { Box, Flex, Heading, Subhead } from 'rebass'
import { Link } from 'react-router'

import Icon from 'metabase/components/Icon'
import CollectionListLoader from 'metabase/components/CollectionListLoader'

import LandingNav from 'metabase/components/LandingNav'

const CollectionList = () => {
  return (
    <CollectionListLoader>
      {({ collections, loading, error }) => {
        if(loading) {
          return <Box>Loading...</Box>
        }
        return (
          <Box>
            { collections.map(collection =>
              <Flex align='center' key={`collection-${collection.id}`}>
                <Icon name='collection' />
                <Link to={`collections/${collection.slug}`}>{ collection.name }</Link>
              </Flex>
            )}
          </Box>
        )
      }}
    </CollectionListLoader>
  )
}

const DefaultLanding = () => {
  return (
    <Box w='100%'>
      <LandingNav />
      <Subhead>Pins</Subhead>
      <Subhead>Other stuff</Subhead>
    </Box>
  )
}

class CollectionLanding  extends React.Component {
  render () {
    const { children } = this.props
    return (
      <Box className="wrapper">
        <Box my={2}>
          { /* TODO - this should be the collection or instance name */ }
          <Heading>Metabase, Inc</Heading>
        </Box>
        <Flex>
          <Box w={1/3}>
            <CollectionList />
          </Box>
          { children ? children : <DefaultLanding />  }
        </Flex>
      </Box>
    )
  }
}

export default CollectionLanding
