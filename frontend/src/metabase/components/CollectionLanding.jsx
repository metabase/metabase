import React from "react";
import { Box, Flex, Heading, Subhead } from "rebass";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import CollectionListLoader from "metabase/components/CollectionListLoader";
import EntityMenu from 'metabase/components/EntityMenu'

import SegmentList from 'metabase/components/SegmentList'
import MetricList from 'metabase/components/MetricList'

import LandingNav from "metabase/components/LandingNav";

const CollectionList = ({ collectionSlug }) => {
  return (
    <Box
      p={2}
      style={{ backgroundColor: "#FAFCFE", border: "1px solid #DCE1E4", height: '100vh' }}
    >
      <h3 className="mb2">Collections</h3>
      <CollectionListLoader>
        {({ collections, loading, error }) => {
          if (loading) {
            return <Box>Loading...</Box>;
          }
          let collectionList = collections
          if(collectionSlug) {
            collectionList.reverse()
          }
          return (
            <Box>
              {collections.map(collection => (
                <Flex align="center" my={1} key={`collection-${collection.id}`}>
                  <Icon name="all" className="mr1" />
                  <Link to={`collections/${collection.slug}`}>
                    {collection.name}
                  </Link>
                </Flex>
              ))}
            </Box>
          );
        }}
      </CollectionListLoader>
    </Box>
  );
};

const DefaultLanding = () => {
  return (
    <Box w="100%">
      <Subhead>Pinned metrics</Subhead>
      <MetricList />
      <Subhead>Pinned segments</Subhead>
      <SegmentList />
    </Box>
  );
};

class CollectionLanding extends React.Component {
  render() {
    const { children } = this.props;
    return (
      <Box>
        <Flex py={3} style={{ borderBottom: '1px solid #DCE1E4'}} pl={3}>
          {/* TODO - this should be the collection or instance name */}
          <Subhead>
            <Flex align='center'>
              <Flex>
                <Link to='/'>Metabase, Inc</Link>
              </Flex>
              { this.props.params.collectionSlug && (
                <Flex align='center'>
                  <Icon name='chevronright' className="ml2 mr2" />
                  <Flex>
                    <Link to={`/collections/${this.props.params.collectionSlug}`}>
                      {this.props.params.collectionSlug }
                    </Link>
                  </Flex>
                </Flex>
              )}
            </Flex>
          </Subhead>

          <Box ml='auto'>
            <EntityMenu
              items={[
                {
                  action: function noRefCheck() {},
                  icon: 'editdocument',
                  title: 'Edit this question'
                },
                {
                  icon: 'history',
                  link: '/derp',
                  title: 'View revision history'
                },
                {
                  action: function noRefCheck() {},
                  icon: 'move',
                  title: 'Move'
                },
                {
                  action: function noRefCheck() {},
                  icon: 'archive',
                  title: 'Archive'
                }
              ]}
              triggerIcon="pencil"
            />
          </Box>
        </Flex>
        <Flex>
          <Box w={1 / 3}>
            <CollectionList collectionSlug={this.props.params.collectionSlug} />
          </Box>
          <Box w={2 / 3} ml={3}>
            <Box>
              <Box py={2}>
                <LandingNav collectionSlug={this.props.params.collectionSlug} />
              </Box>
              {children ? children : <DefaultLanding />}
            </Box>
          </Box>
        </Flex>
      </Box>
    );
  }
}

export default CollectionLanding;
