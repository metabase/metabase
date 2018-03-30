import React from "react";
import { Box, Flex, Heading, Subhead } from "rebass";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import CollectionListLoader from "metabase/components/CollectionListLoader";

import LandingNav from "metabase/components/LandingNav";

const CollectionList = () => {
  return (
    <Box
      p={1}
      style={{ backgroundColor: "#FAFCFE", border: "1px solid #DCE1E4" }}
    >
      <CollectionListLoader>
        {({ collections, loading, error }) => {
          if (loading) {
            return <Box>Loading...</Box>;
          }
          return (
            <Box>
              {collections.map(collection => (
                <Flex align="center" key={`collection-${collection.id}`}>
                  <Icon name="all" />
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
      <Subhead>Pins</Subhead>
      <Subhead>Other stuff</Subhead>
    </Box>
  );
};

class CollectionLanding extends React.Component {
  render() {
    const { children } = this.props;
    return (
      <Box className="wrapper">
        <Box my={2}>
          {/* TODO - this should be the collection or instance name */}
          <Heading>Metabase, Inc</Heading>
        </Box>
        <Flex>
          <Box w={2 / 3}>
            <LandingNav />
            {children ? children : <DefaultLanding />}
          </Box>
          <Box w={1 / 3}>
            <CollectionList />
          </Box>
        </Flex>
      </Box>
    );
  }
}

export default CollectionLanding;
