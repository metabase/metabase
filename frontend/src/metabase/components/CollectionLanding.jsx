import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";
import cx from "classnames";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";

import CollectionContent from "metabase/collections/containers/CollectionContent";

import fitViewport from "metabase/hoc/FitViewPort";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

@fitViewport
class CollectionLanding extends React.Component {
  render() {
    const {
      params: { collectionId },
    } = this.props;
    const isRoot = collectionId === "root";

    return (
      <Box className={cx(this.props.fitClassNames, "overflow-hidden")}>
        <Box
          pl={"40px"}
          pt={"22px"}
          w={340}
          className="overflow-y-scroll relative"
        >
          <Box mt={"22px"} mb={"32px"}>
            Hey there User
          </Box>
          <Link
            className="link flex align-center text-bold"
            to={Urls.collection("root")}
            mb={2}
          >
            <Icon name="folder" mr={1} />
            {t`Our analytics`}
          </Link>
          {/* TODO - re-integrate drag and drop from metabase/components/CollectionList */}
          <Collection.ListLoader>
            {({ list }) => (
              <CollectionsList
                collections={list.filter(l => !l.personal_owner_id)}
              />
            )}
          </Collection.ListLoader>

          {/* TODO - need to make sure the user can create collections here */}
          <Link
            mt={3}
            to={Urls.newCollection(collectionId)}
            className="link flex align-center text-bold"
            data-metabase-event={`Collection Landing;Collection List; New Collection Click`}
          >
            <Icon name="add" mr={1} />
            {t`New collection`}
          </Link>
        </Box>
        <Box bg="white" flex={1} className="overflow-y-scroll border-left">
          <CollectionContent isRoot={isRoot} collectionId={collectionId} />
        </Box>
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
                <Flex
                  className="absolute text-brand cursor-pointer bg-brand-light-hover"
                  align="center"
                  justifyContent="center"
                  style={{ left: -20 }}
                >
                  <Icon
                    name={open === c.id ? "chevrondown" : "chevronright"}
                    onClick={() => this.setState({ open: c.id })}
                    size={10}
                  />
                </Flex>
              )}
              <Link
                className="flex align-center link text-bold"
                my={"8px"}
                to={Urls.collection(c.id)}
              >
                <Icon name="folder" mr={"4px"} style={{ opacity: 0.4 }} />
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
