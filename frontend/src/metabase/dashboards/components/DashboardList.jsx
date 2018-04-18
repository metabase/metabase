/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "rebass";
import { Link } from "react-router";
import cx from "classnames";
import moment from "moment";
import { t } from "c-3po";

import * as Urls from "metabase/lib/urls";

import type { Dashboard } from "metabase/meta/types/Dashboard";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Tooltip from "metabase/components/Tooltip";
import CheckBox from "metabase/components/CheckBox";

import { normal } from "metabase/lib/colors";

type DashboardListItemProps = {
  dashboard: Dashboard,
  setFavorited: (dashId: number, favorited: boolean) => void,
  setArchived: (dashId: number, archived: boolean) => void,
};

type SelectableProps = {
  onSelectItem: () => void,
  selectedItems: [],
};

export const selectable = identifierFn => ComposedComponent => {
  return class extends React.Component {
    props: SelectableProps;
    static displayName = "Selectable";

    constructor(props) {
      super(props);
      this.identifier = identifierFn(props);
    }
    render() {
      const { selectedItems } = this.props;
      const selected = selectedItems && selectedItems.includes(this.identifier);

      return (
        <span className="flex align-center relative hover-parent hover--visibility">
          <span
            className={cx("hover-child absolute p1", { visible: selected })}
            style={{ left: -30 }}
          >
            <CheckBox
              checked={selected}
              onChange={() => this.props.onSelectItem(this.identifier)}
            />
          </span>
          <ComposedComponent {...this.props} selected={selected} />
        </span>
      );
    }
  };
};

export const selectManager = ComposedComponent =>
  class extends React.Component {
    static displayName = "SelectManager";

    state = {
      selectedItems: [],
    };

    onSelectItem(id) {
      const selected = this.state.selectedItems;

      if (selected.includes(id)) {
        this.setState({
          selectedItems: selected.filter(item => item !== id),
        });
      } else {
        this.setState({ selectedItems: selected.concat([id]) });
      }
    }

    render() {
      console.log("Select Manager Props", this.props);
      console.log("Select Manager State", this.state);
      return (
        <div>
          <ComposedComponent
            {...this.props}
            onSelectItem={this.onSelectItem.bind(this)}
            selectedItems={this.state.selectedItems}
          />
        </div>
      );
    }
  };

const withSelectControls = ComposedComponent =>
  class extends React.Component {
    render() {
      console.log("withSelectControl Props", this.props);
      return <ComposedComponent {...this.props} />;
    }
  };

@selectable(({ dashboard }) => ({ identifier: dashboard.id }))
export class DashboardListItem extends Component {
  //props: DashboardListItemProps;

  state = {
    fadingOut: false,
  };

  render() {
    const { dashboard, setFavorited, setArchived, selected } = this.props;

    const { fadingOut } = this.state;

    const { id, name, created_at, archived, favorite } = dashboard;

    return (
      <Link
        to={Urls.dashboard(id)}
        data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + id}
        className={cx(
          "border-bottom full flex align-center relative p1 no-decoration",
          { "bg-slate-extra-light": selected },
        )}
      >
        <Box
          p={1}
          bg={selected ? normal.blue : normal.grey1}
          color={selected ? "white" : "inherit"}
          mr={1}
          className="rounded"
          style={{ lineHeight: 1 }}
        >
          <Icon name="dashboard" />
        </Box>
        <div className={"flex-full shrink-below-content-size"}>
          <div className="flex align-center">
            <div className={"flex-full shrink-below-content-size"}>
              <h3
                className={cx(
                  "text-ellipsis text-nowrap overflow-hidden text-bold transition-all",
                )}
                style={{ marginBottom: "0.3em" }}
              >
                <Ellipsified>
                  {name} {id}
                </Ellipsified>
              </h3>
              <div
                className={"text-smaller text-uppercase text-bold text-grey-3"}
              >
                {/* NOTE: Could these time formats be centrally stored somewhere? */}
                {moment(created_at).format("MMM D, YYYY")}
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }
}

@withSelectControls
@selectManager
class DashboardList extends Component {
  static propTypes = {
    dashboards: PropTypes.array.isRequired,
  };

  render() {
    const {
      dashboards,
      selectedItems,
      onSelectItem,
      isArchivePage,
      setFavorited,
      setArchived,
    } = this.props;

    return (
      <ol>
        {dashboards.map(dash => (
          <DashboardListItem
            key={dash.id}
            dashboard={dash}
            setFavorited={setFavorited}
            setArchived={setArchived}
            disableLink={isArchivePage}
            selectedItems={selectedItems}
            onSelectItem={onSelectItem}
          />
        ))}
      </ol>
    );
  }
}

export default DashboardList;
