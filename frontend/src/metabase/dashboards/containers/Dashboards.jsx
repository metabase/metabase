/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import cx from "classnames";
import _ from "underscore";
import { t, jt } from "c-3po";

import type { Dashboard } from "metabase/meta/types/Dashboard";

import DashboardList from "../components/DashboardList";

import TitleAndDescription from "metabase/components/TitleAndDescription";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import Modal from "metabase/components/Modal.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon.jsx";
import SearchHeader from "metabase/components/SearchHeader";
import EmptyState from "metabase/components/EmptyState";
import ListFilterWidget from "metabase/components/ListFilterWidget";
import type { ListFilterWidgetItem } from "metabase/components/ListFilterWidget";

import { caseInsensitiveSearch } from "metabase/lib/string";

import type { SetFavoritedAction, SetArchivedAction } from "../dashboards";
import type { User } from "metabase/meta/types/User";
import * as dashboardsActions from "../dashboards";
import { getDashboardListing } from "../selectors";
import { getUser } from "metabase/selectors/user";

const mapStateToProps = (state, props) => ({
  dashboards: getDashboardListing(state),
  user: getUser(state),
});

const mapDispatchToProps = dashboardsActions;

const SECTION_ID_ALL = "all";
const SECTION_ID_MINE = "mine";
const SECTION_ID_FAVORITES = "fav";

const SECTIONS: ListFilterWidgetItem[] = [
  {
    id: SECTION_ID_ALL,
    name: t`All dashboards`,
    icon: "dashboard",
    // empty: 'No questions have been saved yet.',
  },
  {
    id: SECTION_ID_FAVORITES,
    name: t`Favorites`,
    icon: "star",
    // empty: 'You haven\'t favorited any questions yet.',
  },
  {
    id: SECTION_ID_MINE,
    name: t`Saved by me`,
    icon: "mine",
    // empty:  'You haven\'t saved any questions yet.'
  },
];

export class Dashboards extends Component {
  props: {
    dashboards: Dashboard[],
    createDashboard: Dashboard => any,
    fetchDashboards: () => void,
    setFavorited: SetFavoritedAction,
    setArchived: SetArchivedAction,
    user: User,
  };

  state = {
    modalOpen: false,
    searchText: "",
    section: SECTIONS[0],
  };

  componentWillMount() {
    this.props.fetchDashboards();
  }

  async onCreateDashboard(newDashboard: Dashboard) {
    let { createDashboard } = this.props;

    try {
      await createDashboard(newDashboard, { redirect: true });
    } catch (e) {
      console.log("createDashboard failed", e);
    }
  }

  showCreateDashboard = () => {
    this.setState({ modalOpen: !this.state.modalOpen });
  };

  hideCreateDashboard = () => {
    this.setState({ modalOpen: false });
  };

  renderCreateDashboardModal() {
    return (
      <Modal>
        <CreateDashboardModal
          createDashboardFn={this.onCreateDashboard.bind(this)}
          onClose={this.hideCreateDashboard}
        />
      </Modal>
    );
  }

  searchTextFilter = (searchText: string) => ({
    name,
    description,
  }: Dashboard) =>
    caseInsensitiveSearch(name, searchText) ||
    (description && caseInsensitiveSearch(description, searchText));

  sectionFilter = (section: ListFilterWidgetItem) => ({
    creator_id,
    favorite,
  }: Dashboard) =>
    section.id === SECTION_ID_ALL ||
    (section.id === SECTION_ID_MINE && creator_id === this.props.user.id) ||
    (section.id === SECTION_ID_FAVORITES && favorite === true);

  getFilteredDashboards = () => {
    const { searchText, section } = this.state;
    const { dashboards } = this.props;
    const noOpFilter = _.constant(true);

    return _.chain(dashboards)
      .filter(searchText != "" ? this.searchTextFilter(searchText) : noOpFilter)
      .filter(this.sectionFilter(section))
      .value()
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  };

  updateSection = (section: ListFilterWidgetItem) => {
    this.setState({ section });
  };

  render() {
    let { modalOpen, searchText, section } = this.state;

    const isLoading = this.props.dashboards === null;
    const noDashboardsCreated =
      this.props.dashboards && this.props.dashboards.length === 0;
    const filteredDashboards = isLoading ? [] : this.getFilteredDashboards();
    const noResultsFound = filteredDashboards.length === 0;

    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        className={cx("relative px4 full-height", {
          "flex flex-full flex-column": noDashboardsCreated,
        })}
        noBackground
      >
        {modalOpen ? this.renderCreateDashboardModal() : null}
        <div className="flex align-center pt4 pb1">
          <TitleAndDescription title={t`Dashboards`} />

          <div className="flex-align-right cursor-pointer text-grey-5">
            <Link to="/dashboards/archive">
              <Icon
                name="viewArchive"
                className="mr2 text-brand-hover"
                tooltip={t`View the archive`}
                size={20}
              />
            </Link>

            {!noDashboardsCreated && (
              <Icon
                name="add"
                className="text-brand-hover"
                tooltip={t`Add new dashboard`}
                size={20}
                onClick={this.showCreateDashboard}
              />
            )}
          </div>
        </div>
        {noDashboardsCreated ? (
          <div className="mt2 flex-full flex align-center justify-center">
            <EmptyState
              message={
                <span>{jt`Put the charts and graphs you look at ${(
                  <br />
                )}frequently in a single, handy place.`}</span>
              }
              image="app/img/dashboard_illustration"
              action={t`Create a dashboard`}
              onActionClick={this.showCreateDashboard}
              className="mt2"
              imageClassName="mln2"
            />
          </div>
        ) : (
          <div>
            <div className="flex-full flex align-center pb1">
              <SearchHeader
                searchText={searchText}
                setSearchText={text => this.setState({ searchText: text })}
              />
              <div className="flex-align-right">
                <ListFilterWidget
                  items={SECTIONS.filter(item => item.id !== "archived")}
                  activeItem={section}
                  onChange={this.updateSection}
                />
              </div>
            </div>
            {noResultsFound ? (
              <div className="flex justify-center">
                <EmptyState
                  message={
                    <div className="mt4">
                      <h3 className="text-grey-5">{t`No results found`}</h3>
                      <p className="text-grey-4">{t`Try adjusting your filter to find what you’re looking for.`}</p>
                    </div>
                  }
                  image="app/img/empty_dashboard"
                  imageHeight="210px"
                  action={t`Create a dashboard`}
                  imageClassName="mln2"
                  smallDescription
                />
              </div>
            ) : (
              <DashboardList
                dashboards={filteredDashboards}
                setFavorited={this.props.setFavorited}
                setArchived={this.props.setArchived}
              />
            )}
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Dashboards);
