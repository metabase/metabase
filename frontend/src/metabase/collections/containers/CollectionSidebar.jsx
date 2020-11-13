import React from "react"
import { connect } from "react-redux"
import { Box } from "grid-styled"
import { t } from "ttag"
import styled from "styled-components"

import * as Urls from "metabase/lib/urls"

import Collection from "metabase/entities/collections";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import Greeting from "metabase/collections/containers/Greeting"

import CollectionsList from "metabase/collections/components/CollectionList";
import CollectionLink from "metabase/collections/components/CollectionLink";

import { SIDEBAR_SPACER } from "metabase/collections/constants"
import { nonPersonalCollection, currentUserPersonalCollections } from "metabase/collections/utils"

const getCurrentUser = ({ currentUser }) =>  currentUser

// TODO - what's different about this from another sidebar component?
const Sidebar = styled(Box)`
  position: fixed;
  left: 0;
  bottom: 0;
  top: 65px;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const CollectionSidebar  = ({ currentUser, isRoot, collectionId }) => 
        <Sidebar w={340} pt={3}>
          <Box pl="28px">
            <Greeting />
          </Box>
          <CollectionLink
            to={Urls.collection("root")}
            selected={isRoot}
            mb={2}
            mt={2}
          >
            <Icon name="folder" mr={1} />
            {t`Our analytics`}
          </CollectionLink>
          <Collection.ListLoader>
            {({ list }) => (
              <Box pb={4}>
                <CollectionsList
                  collections={list}
                  filter={nonPersonalCollection}
                  currentCollection={collectionId}
                />

                <Box mt={"32px"}>
                  <CollectionsList
                    collections={currentUserPersonalCollections(
                      list,
                      currentUser.id,
                    )}
                    initialIcon="person"
                    currentCollection={collectionId}
                  />
                </Box>

                {currentUser.is_superuser && (
                  <CollectionLink to={Urls.collection("users")}>
                    <Icon name="group" mr={1} />
                    {t`Other users' personal collections`}
                  </CollectionLink>
                )}
              </Box>
            )}
          </Collection.ListLoader>

          <Box className="mt-auto" pb={2} pl={SIDEBAR_SPACER * 2}>
            <Link to={`/archive`} className="link flex align-center text-bold">
              <Icon name="view_archive" mr={1} />
              {t`View archived items`}
            </Link>
          </Box>
        </Sidebar>

export default connect(getCurrentUser)(CollectionSidebar)