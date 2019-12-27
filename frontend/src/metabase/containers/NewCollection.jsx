import React from "react";
import { connect } from "react-redux";

import { Box } from "grid-styled";
import { PillWithAdornment } from "metabase/components/Pill";
import Icon from "metabase/components/Icon";

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
      left={<Icon name={collection.icon} />}
      right={collection.hasChildren && <Icon name="chevrondown" size={12} />}
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
      <Box my={3}>
        <h3>Hey there Kyle</h3>
      </Box>
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
