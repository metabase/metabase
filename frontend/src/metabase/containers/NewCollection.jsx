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

const CollectionLink = ({ collection, isSelected }) => (
  <Box className="CollectionLink" mb={1}>
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

const CollectionLinkList = ({ collections }) => (
  <Box>
    {collections.map(collection => (
      <CollectionLink collection={collection} />
    ))}
  </Box>
);

const CollectionItemList = ({ items }) => (
  <table className="Table">
    <thead>
      <th></th>
      <th>Name</th>
      <th>Creator</th>
      <th>Last updated</th>
    </thead>
    <tbody>
      {items.map(item => (
        <CollectionItem item={item} />
      ))}
    </tbody>
  </table>
);
const CollectionItem = ({ item }) => (
  <tr>
    <td>
      <div className="inline-block">
        <div className="bg-brand p2 circle text-white flex align-center">
          <Icon name={item.type} />
        </div>
      </div>
    </td>
    <td>
      <h3>{item.name}</h3>
    </td>
    <td>{item.creator}</td>
    <td>{item.modified_at}</td>
  </tr>
);

const CollectionActions = () => (
  <Flex algin="center" ml="auto">
    <Icon name="lock" />
    <Icon name="pencil" />
    <Icon name="add" />
  </Flex>
);

const NewCollection = ({ items, collections }) => (
  <div className="relative">
    <Box w={300} px={2} ml={2} className="absolute left top bottom">
      <Flex my={3} align="center">
        <UserAvatar />
        <h3 className="ml2 text-heavy">Hey there Kyle</h3>
      </Flex>
      <Box>
        <CollectionLink
          collection={{ name: "Our analytics", icon: "folder" }}
        />
      </Box>
      <CollectionLinkList collections={collections} />
      <Box mt={2}>
        <CollectionLink
          collection={{ name: "Your personal collection", icon: "person" }}
        />
      </Box>
    </Box>

    <Box bg="white" ml={360} className="full-height border-left">
      <Box w={"80%"} ml="auto" mr="auto">
        <Flex align="center">
          <h1 className="text-heavy py2">Marketing</h1>
          <CollectionActions />
        </Flex>
        <Box py={3}>
          <h5 className="text-uppercase text-heavy">{t`Pinned items`}</h5>
          <CollectionItemList items={[items[0], items[1]]} />
        </Box>

        <Box py={3}>
          <CollectionItemList items={items} />
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
