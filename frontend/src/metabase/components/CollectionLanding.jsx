import React from "react";
import { Box, Flex } from "grid-styled";

import Collection from "metabase/entities/collections";

import CollectionContent from "metabase/collections/containers/CollectionContent";

import * as Urls from "metabase/lib/urls";

import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

class CollectionLanding extends React.Component {
  render() {
    const {
      params: { collectionId },
    } = this.props;
    const isRoot = collectionId === "root";

    const collectionWidth = [1, 1 / 3];
    const itemWidth = [1, 2 / 3];
    return (
      <Box>
        <Grid>
          <GridItem w={collectionWidth}>
            <Box px={2}>
              <Link
                className="link block text-bold"
                to={Urls.collection("root")}
                mb={2}
              >
                Our analytics
              </Link>
              <Collection.ListLoader>
                {({ list }) => (
                  <CollectionsList
                    collections={list.filter(l => !l.personal_owner_id)}
                  />
                )}
              </Collection.ListLoader>
              {/*
                      <CollectionList
                        analyticsContext={ANALYTICS_CONTEXT}
                        currentCollection={collection}
                        collections={collections}
                        isRoot={collectionId === "root"}
                        w={collectionGridSize}
                      />
                      */}
            </Box>
          </GridItem>
          <GridItem w={itemWidth} bg="white">
            <CollectionContent isRoot={isRoot} collectionId={collectionId} />
          </GridItem>
        </Grid>
        {
          // Need to have this here so the child modals will show up
          this.props.children
        }
      </Box>
    );
  }
}

class CollectionsList extends React.Component {
  state = {
    // @hack - store the open collection as the collection's id.
    // @TODO - need to figure out how to handle state when using a recursive component
    open: null,
  };
  render() {
    const { collections } = this.props;
    const { open } = this.state;

    return (
      <Box>
        {collections.map(c => (
          <Box>
            <Flex align="center" className="relative">
              {c.children && (
                <Icon
                  className="absolute"
                  name={open === c.id ? "chevrondown" : "chevronright"}
                  onClick={() => this.setState({ open: c.id })}
                  style={{ left: -20 }}
                />
              )}
              <Link
                className="block link text-bold"
                my={"8px"}
                to={Urls.collection(c.id)}
              >
                {c.name}
              </Link>
            </Flex>
            {c.children && open === c.id && (
              <Box ml="8px">
                <CollectionsList collections={c.children} />
              </Box>
            )}
          </Box>
        ))}
      </Box>
    );
  }
}

export default CollectionLanding;
