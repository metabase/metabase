import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Box, Flex } from "grid-styled";

import UserAvatar from "metabase/components/UserAvatar";
import Icon from "metabase/components/Icon";
import { PillWithAdornment } from "metabase/components/Pill";

const FIXTURE_ITEMS = [
  {
    name: "2019 Campaigns",
    type: "dashboard",
  },
  {
    name: "2019 Collaborations",
    type: "dashboard",
  },
  {
    name: "2020 Planning (Draft)",
    type: "dashboard",
  },
  {
    name: "Cool Question",
    type: "question",
  },
];

const FIXTURE_COLLECTIONS = [
  {
    name: "Marketing",
    icon: "folder",
    active: true,
  },
  {
    name: "Ops",
    hasChildren: true,
    icon: "folder",
  },
  {
    name: "Internal",
    icon: "folder",
  },
  {
    name: "Stripe",
    icon: "folder",
  },
];

const CollectionItem = ({ collection, isSelected }) => (
  <Box mb={1}>
    <PillWithAdornment
      active={collection.active}
      left={<Icon name={collection.icon} color="brand" />}
      right={
        collection.hasChildren && (
          <Icon name="chevrondown" size={12} color="brand" />
        )
      }
    >
      {collection.name}
    </PillWithAdornment>
  </Box>
);

const CollectionList = ({ collections }) => (
  <Box>
    {collections.map(collection => (
      <CollectionItem collection={collection} />
    ))}
  </Box>
);

const CollectionContent = ({ item }) => (
  <Box className="border-bottom" py={2}>
    <h3>{item.name}</h3>
  </Box>
);

const NewCollection = ({ items, collections }) => (
  <div className="relative">
    <Box w={300} px={2} ml={2} className="absolute left top bottom">
      <Flex my={3} align="center">
        <UserAvatar />
        <h3 className="ml2 text-bold">Hey there Kyle</h3>
      </Flex>
      <Box>
        <CollectionItem
          collection={{ name: "Our analytics", icon: "folder" }}
        />
      </Box>
      <CollectionList collections={collections} />
      <Box mt={2}>
        <CollectionItem
          collection={{ name: "Your personal collection", icon: "person" }}
        />
      </Box>
    </Box>

    <Box bg="white" ml={360} className="full-height border-left">
      <Box w={"80%"} ml="auto" mr="auto">
        <Box py={3} pt={2}>
          <h1>Marketing</h1>
        </Box>
        <Box py={3}>
          <h4>{t`Pinned items`}</h4>
          {items.map(item => (
            <CollectionContent item={item} />
          ))}
        </Box>

        <Box py={3}>
          {items.map(item => (
            <CollectionContent item={item} />
          ))}
        </Box>
      </Box>
    </Box>
  </div>
);

const mapStateToProps = () => ({
  items: FIXTURE_ITEMS,
  collections: FIXTURE_COLLECTIONS,
});

export default connect(mapStateToProps)(NewCollection);
