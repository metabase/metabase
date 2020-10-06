import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Box, Flex } from "grid-styled";

import UserAvatar from "metabase/components/UserAvatar";
import Icon, { IconWrapper } from "metabase/components/Icon";
import { PillWithAdornment } from "metabase/components/Pill";

import EntityMenu from "metabase/components/EntityMenu";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import Label from "metabase/components/type/Label";

import Link from "metabase/components/Link";

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

const CollectionLink = ({ collection, isSelected, ...props }) => (
  <Box className="CollectionLink" mb={1} {...props}>
    <PillWithAdornment
      active={collection.active}
      left={<Icon name={collection.icon} />}
      right={collection.hasChildren && <Icon name="chevrondown" size={12} />}
    >
      {collection.name}
    </PillWithAdornment>
  </Box>
);

const CollectionLinkList = ({ collections }) => (
  <Box>
    {collections.map(collection => (
      <CollectionLink collection={collection} key={collection.name} />
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
      <Link to="/" className="link">
        <Label>{item.name}</Label>
      </Link>
    </td>
    <td>
      <h3 className="text-medium">{item.creator}</h3>
    </td>
    <td>
      <h3 className="text-medium">{item.modified_at}</h3>
    </td>
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
        <IconWrapper className="mr1">
          <Link
            to={""}
            className="flex align-center"
            data-metabase-event={`Collection;Perms`}
          >
            <Icon
              size={18}
              p={"11px"}
              name="lock"
              tooltip={t`Edit collection permissions`}
            />
          </Link>
        </IconWrapper>
        <EntityMenu
          tooltip={t`Edit`}
          className="mr1"
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
          className="mr1"
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
    <Subhead ml={1}>Hey there Kyle</Subhead>
  </Flex>
);

const CollectionSubhead = ({ children }) => (
  <h5 className="text-uppercase text-heavy text-medium">{children}</h5>
);

const CollectionPins = ({ pinnedItems }) => (
  <Box py={3}>
    <CollectionSubhead>{t`Pinned items`}</CollectionSubhead>
    <Box mt={2}>
      <CollectionItemList items={pinnedItems} />
    </Box>
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
        mt={3}
      />
    </CollectionSidebar>

    <CollectionContent>
      <CollectionHeader>
        <Heading>Marketing</Heading>
        <CollectionActions />
      </CollectionHeader>

      <CollectionPins pinnedItems={[items[0], items[1]]} />

      <Box py={3} mb={2}>
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
