import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Box, Flex } from "grid-styled";

import UserAvatar from "metabase/components/UserAvatar";
import Icon from "metabase/components/Icon";
import { PillWithAdornment } from "metabase/components/Pill";

import EntityMenu from "metabase/components/EntityMenu";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";

const FIXTURE_ITEMS = [
  {
    name: "2019 Campaigns",
    type: "dashboard",
    creator: "Damon",
    modified_at: "Oct 19, 2019",
  },
  {
    name: "2019 Collaborations",
    type: "dashboard",
    creator: "Kyle",
    modified_at: "Oct 19, 2019",
  },
  {
    name: "2020 Planning (Draft)",
    type: "dashboard",
    creator: "Cam",
    modified_at: "Oct 19, 2019",
  },
  {
    name: "Cool Question",
    type: "question",
    creator: "Paul",
    modified_at: "Oct 19, 2019",
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
    <td className="shrink">
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

class CollectionActions extends React.Component {
  state = {
    modal: null,
  };

  setModal(modal) {
    this.setState({ modal });
    if (this._newPopover) {
      this._newPopover.close();
    }
  }

  renderModal() {
    const { modal } = this.state;
    if (modal) {
      return (
        <Modal onClose={() => this.setState({ modal: null })}>
          {modal === MODAL_NEW_DASHBOARD ? (
            <CreateDashboardModal
              createDashboard={this.props.createDashboard}
              onClose={() => this.setState({ modal: null })}
            />
          ) : null}
        </Modal>
      );
    } else {
      return null;
    }
  }

  render() {
    return (
      <Flex algin="center" ml="auto">
        <Icon name="lock" />
        <EntityMenu
          tooltip={t`Edit`}
          className="hide sm-show mr1"
          triggerIcon="pencil"
          items={[
            {
              title: t`New dashboard`,
              icon: `dashboard`,
              action: () => this.setModal(MODAL_NEW_DASHBOARD),
              event: `NavBar;New Dashboard Click;`,
            },
            {
              title: t`New pulse`,
              icon: `pulse`,
              link: Urls.newPulse(),
              event: `NavBar;New Pulse Click;`,
            },
          ]}
        />
        <EntityMenu
          tooltip={t`Create`}
          className="hide sm-show mr1"
          triggerIcon="add"
          items={[
            {
              title: t`New dashboard`,
              icon: `dashboard`,
              action: () => this.setModal(MODAL_NEW_DASHBOARD),
              event: `NavBar;New Dashboard Click;`,
            },
            {
              title: t`New pulse`,
              icon: `pulse`,
              link: Urls.newPulse(),
              event: `NavBar;New Pulse Click;`,
            },
          ]}
        />
      </Flex>
    );
  }
}

const CollectionHeader = ({ children }) => (
  <Flex align="center" pt={3} pb={1}>
    {children}
  </Flex>
);

const CollectionTitle = ({ children }) => (
  <h1 className="text-heavy">{children}</h1>
);

const CollectionContent = ({ children }) => (
  <Box bg="white" ml={360} className="full-height border-left">
    <Box w={"80%"} ml="auto" mr="auto">
      {children}
    </Box>
  </Box>
);

const CollectionSidebar = ({ children }) => (
  <Box w={300} px={2} ml={2} className="absolute left top bottom">
    {children}
  </Box>
);

const Greeting = () => (
  <Flex my={3} align="center">
    <UserAvatar />
    <h3 className="ml2 text-heavy">Hey there Kyle</h3>
  </Flex>
);

const CollectionSubhead = ({ children }) => (
  <h5 className="text-uppercase text-heavy">{children}</h5>
);

const CollectionPins = ({ pinnedItems }) => (
  <Box py={3}>
    <CollectionSubhead>{t`Pinned items`}</CollectionSubhead>
    <CollectionItemList items={pinnedItems} />
  </Box>
);

const NewCollection = ({ items, collections }) => (
  <div className="relative">
    <CollectionSidebar>
      <Greeting />

      <CollectionLink collection={{ name: "Our analytics", icon: "folder" }} />
      <CollectionLinkList collections={collections} />
      <CollectionLink
        collection={{ name: "Your personal collection", icon: "person" }}
        mt={2}
      />
    </CollectionSidebar>

    <CollectionContent>
      <CollectionHeader>
        <CollectionTitle>Marketing</CollectionTitle>>
        <CollectionActions />
      </CollectionHeader>

      <CollectionPins pinnedItems={[items[0], items[1]]} />

      <Box py={3}>
        <CollectionItemList items={items} />
      </Box>
    </CollectionContent>
  </div>
);

const mapStateToProps = () => ({
  items: FIXTURE_ITEMS,
  collections: FIXTURE_COLLECTIONS,
});

export default connect(mapStateToProps)(NewCollection);
