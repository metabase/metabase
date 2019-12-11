import React from "react";
import _ from "underscore";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import { createSelector } from "reselect";

import CollectionItemsLoader from "metabase/containers/CollectionItemsLoader";
import CandidateListLoader from "metabase/containers/CandidateListLoader";
import ExplorePane from "metabase/components/ExplorePane";
import Tooltip from "metabase/components/Tooltip";
import MetabotLogo from "metabase/components/MetabotLogo";
import CollectionList from "metabase/components/CollectionList";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/components/Button";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";
import RetinaImage from "react-retina-image";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import Greeting from "metabase/lib/greeting";

import Database from "metabase/entities/databases";
import Search from "metabase/entities/search";
import { ROOT_COLLECTION } from "metabase/entities/collections";

import { updateSetting } from "metabase/admin/settings/settings";

import { getUser } from "metabase/home/selectors";
import {
  getShowHomepageData,
  getShowHomepageXrays,
} from "metabase/selectors/settings";

const PAGE_PADDING = [1, 2, 4];

// use reselect select to avoid re-render if list doesn't change
const getParitionedCollections = createSelector(
  [(state, props) => props.list],
  list => {
    const [collections, items] = _.partition(
      list,
      item => item.model === "collection",
    );
    const [pinned, unpinned] = _.partition(
      items,
      item => item.collection_position != null,
    );

    // sort the pinned items by collection_position
    pinned.sort((a, b) => a.collection_position - b.collection_position);
    return {
      collections,
      pinned,
      unpinned,
    };
  },
);

//class Overworld extends Zelda
@Search.loadList({
  query: { collection: "root" },
  wrapped: true,
})
@connect(
  (state, props) => ({
    // split out collections, pinned, and unpinned since bulk actions only apply to unpinned
    ...getParitionedCollections(state, props),
    user: getUser(state, props),
    showHomepageData: getShowHomepageData(state),
    showHomepageXrays: getShowHomepageXrays(state),
  }),
  { updateSetting },
)
class Overworld extends React.Component {
  render() {
    const {
      user,
      showHomepageData,
      showHomepageXrays,
      updateSetting,
    } = this.props;
    return (
      <Box>
        <Flex px={PAGE_PADDING} pt={3} pb={1} align="center">
          <Tooltip tooltip={t`Don't tell anyone, but you're my favorite.`}>
            <MetabotLogo />
          </Tooltip>
          <Box ml={2}>
            <Subhead>{Greeting.sayHello(user.first_name)}</Subhead>
          </Box>
        </Flex>
        <CollectionItemsLoader collectionId="root">
          {({ items }) => {
            const pinnedDashboards = items.filter(
              d => d.model === "dashboard" && d.collection_position != null,
            );

            if (showHomepageXrays && !pinnedDashboards.length > 0) {
              return (
                <CandidateListLoader>
                  {({ candidates, sampleCandidates, isSample }) => {
                    // if there are no items to show then just hide the section
                    if (!candidates && !sampleCandidates) {
                      return null;
                    }
                    return (
                      <Box mx={PAGE_PADDING} mt={[1, 3]}>
                        {user.is_superuser && <AdminPinMessage />}
                        <Box
                          mt={[1, 3]}
                          className="hover-parent hover--visibility"
                        >
                          <SectionHeading>
                            <Flex align="center">
                              {t`Try these x-rays based on your data.`}
                              {user.is_superuser && (
                                <ModalWithTrigger
                                  triggerElement={
                                    <Tooltip
                                      tooltip={t`Remove these suggestions`}
                                    >
                                      <Icon
                                        ml="2"
                                        name="close"
                                        className="hover-child text-brand-hover"
                                      />
                                    </Tooltip>
                                  }
                                  title={t`Remove these suggestions?`}
                                  footer={
                                    <Button
                                      danger
                                      onClick={onClose => {
                                        updateSetting({
                                          key: "show-homepage-xrays",
                                          value: false,
                                        });
                                      }}
                                    >
                                      {t`Remove`}
                                    </Button>
                                  }
                                >
                                  <Box>
                                    {t`These won’t show up on the homepage for any of your users anymore, but you can always get to x-rays by clicking on Browse Data in the main navigation, then clicking on the lightning bolt icon on one of your tables.`}
                                  </Box>
                                </ModalWithTrigger>
                              )}
                            </Flex>
                          </SectionHeading>
                          <Box>
                            <ExplorePane
                              candidates={candidates}
                              withMetabot={false}
                              title=""
                              gridColumns={[1, 1 / 3]}
                              asCards={true}
                            />
                          </Box>
                        </Box>
                      </Box>
                    );
                  }}
                </CandidateListLoader>
              );
            }

            if (pinnedDashboards.length === 0) {
              return null;
            }

            return (
              <Box px={PAGE_PADDING} mt={2}>
                <SectionHeading>{t`Start here`}</SectionHeading>
                <Grid>
                  {pinnedDashboards.map(pin => {
                    return (
                      <GridItem
                        w={[1, 1 / 2, 1 / 3]}
                        key={`${pin.model}-${pin.id}`}
                      >
                        <Link
                          data-metabase-event={`Homepage;Pinned Item Click;Pin Type ${pin.model}`}
                          to={Urls.dashboard(pin.id)}
                          hover={{ color: color("brand") }}
                        >
                          <Card hoverable p={3}>
                            <Icon
                              name="dashboard"
                              color={color("brand")}
                              mb={2}
                              size={28}
                            />
                            <Box mt={1}>
                              <h3>{pin.name}</h3>
                            </Box>
                          </Card>
                        </Link>
                      </GridItem>
                    );
                  })}
                </Grid>
              </Box>
            );
          }}
        </CollectionItemsLoader>
        <Box px={PAGE_PADDING} my={3}>
          <SectionHeading>{ROOT_COLLECTION.name}</SectionHeading>
          <Box p={[1, 2]} mt={2} bg={color("bg-medium")}>
            {this.props.collections.filter(
              c => c.id !== user.personal_collection_id,
            ).length > 0 ? (
              <CollectionList
                collections={this.props.collections}
                analyticsContext="Homepage"
                asCards={true}
              />
            ) : (
              <Box className="text-centered">
                <Box style={{ opacity: 0.5 }}>
                  <RetinaImage
                    src="app/img/empty.png"
                    className="block ml-auto mr-auto"
                  />
                </Box>
                <h3 className="text-medium">
                  {user.is_superuser
                    ? t`Save dashboards, questions, and collections in "${ROOT_COLLECTION.name}"`
                    : t`Access dashboards, questions, and collections in "${ROOT_COLLECTION.name}"`}
                </h3>
              </Box>
            )}
            <Link
              to="/collection/root"
              color={color("text-medium")}
              className="text-brand-hover"
              data-metabase-event={`Homepage;Browse Items Clicked;`}
            >
              <Flex color={color("brand")} p={2} my={1} align="center">
                <Box ml="auto" mr="auto">
                  <Flex align="center">
                    <h4>{t`Browse all items`}</h4>
                    <Icon name="chevronright" size={14} ml={1} />
                  </Flex>
                </Box>
              </Flex>
            </Link>
          </Box>
        </Box>
        {showHomepageData && (
          <Database.ListLoader>
            {({ databases }) => {
              if (databases.length === 0) {
                return null;
              }
              return (
                <Box
                  pt={2}
                  px={PAGE_PADDING}
                  className="hover-parent hover--visibility"
                >
                  <SectionHeading>
                    <Flex align="center">
                      {t`Our data`}
                      {user.is_superuser && (
                        <ModalWithTrigger
                          triggerElement={
                            <Tooltip tooltip={t`Hide this section`}>
                              <Icon
                                ml="4"
                                name="close"
                                className="block hover-child text-brand-hover"
                              />
                            </Tooltip>
                          }
                          title={t`Remove this section?`}
                          footer={
                            <Button
                              danger
                              onClick={onClose => {
                                updateSetting({
                                  key: "show-homepage-data",
                                  value: false,
                                });
                              }}
                            >
                              {t`Remove`}
                            </Button>
                          }
                        >
                          <Box>
                            {t`"Our Data" won’t show up on the homepage for any of your users anymore, but you can always browse through your databases and tables by clicking Browse Data in the main navigation.`}
                          </Box>
                        </ModalWithTrigger>
                      )}
                    </Flex>
                  </SectionHeading>
                  <Box mb={4}>
                    <Grid>
                      {databases.map(database => (
                        <GridItem w={[1, 1 / 3]} key={database.id}>
                          <Link
                            to={`browse/${database.id}`}
                            hover={{ color: color("brand") }}
                            data-metabase-event={`Homepage;Browse DB Clicked; DB Type ${database.engine}`}
                          >
                            <Box
                              p={3}
                              bg={color("bg-medium")}
                              className="hover-parent hover--visibility"
                            >
                              <Icon
                                name="database"
                                color={color("database")}
                                mb={3}
                                size={28}
                              />
                              <Flex align="center">
                                <h3 className="text-wrap">{database.name}</h3>
                                <Box ml="auto" mr={1} className="hover-child">
                                  <Flex align="center">
                                    <Tooltip
                                      tooltip={t`Learn about this database`}
                                    >
                                      <Link
                                        to={`reference/databases/${database.id}`}
                                      >
                                        <Icon
                                          name="reference"
                                          color={color("text-light")}
                                        />
                                      </Link>
                                    </Tooltip>
                                  </Flex>
                                </Box>
                              </Flex>
                            </Box>
                          </Link>
                        </GridItem>
                      ))}
                    </Grid>
                  </Box>
                </Box>
              );
            }}
          </Database.ListLoader>
        )}
      </Box>
    );
  }
}

export const PIN_MESSAGE_STORAGE_KEY =
  "mb-admin-homepage-pin-propaganda-hidden";

export class AdminPinMessage extends React.Component {
  state = {
    showMessage: !window.localStorage.getItem(PIN_MESSAGE_STORAGE_KEY),
  };

  dismissPinMessage = () => {
    window.localStorage.setItem(PIN_MESSAGE_STORAGE_KEY, "true");
    this.setState({ showMessage: false });
  };
  render() {
    const { showMessage } = this.state;

    if (!showMessage) {
      return null;
    }

    const link = (
      <Link className="link" to={Urls.collection()}>{t`Our analytics`}</Link>
    );

    return (
      <Box>
        <SectionHeading>{t`Start here`}</SectionHeading>

        <Flex
          bg={color("bg-medium")}
          p={2}
          align="center"
          style={{ borderRadius: 6 }}
          className="hover-parent hover--visibility"
        >
          <Icon name="dashboard" color={color("brand")} size={32} mr={1} />
          <Box ml={1}>
            <h3>{t`Your team's most important dashboards go here`}</h3>
            <p className="m0 mt1 text-medium text-bold">{jt`Pin dashboards in ${link} to have them appear in this space for everyone`}</p>
          </Box>
          <Icon
            className="hover-child text-brand-hover cursor-pointer bg-medium"
            name="close"
            ml="auto"
            onClick={() => this.dismissPinMessage()}
          />
        </Flex>
      </Box>
    );
  }
}

const SectionHeading = ({ children }) => (
  <Box mb={1}>
    <h5
      className="text-uppercase"
      style={{ color: color("text-medium"), fontWeight: 900 }}
    >
      {children}
    </h5>
  </Box>
);

export default Overworld;
