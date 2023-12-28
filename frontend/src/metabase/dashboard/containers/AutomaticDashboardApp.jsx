/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";

import { dissoc } from "icepick";
import title from "metabase/hoc/Title";
import withToast from "metabase/hoc/Toast";
import { DashboardData } from "metabase/dashboard/hoc/DashboardData";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import Card from "metabase/components/Card";
import { Icon } from "metabase/core/components/Icon";
import Filter from "metabase/query_builder/components/Filter";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";

import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

import { getMetadata } from "metabase/selectors/metadata";
import { getIsHeaderVisible, getTabs } from "metabase/dashboard/selectors";

import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import * as Urls from "metabase/lib/urls";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";
import * as Q from "metabase-lib/queries/utils/query";
import { getFilterDimension } from "metabase-lib/queries/utils/dimension";
import { isSegment } from "metabase-lib/queries/utils/filter";

import { DashboardTabs } from "../components/DashboardTabs";
import {
  ItemContent,
  ItemDescription,
  ItemLink,
  ListRoot,
  SidebarHeader,
  SidebarRoot,
  XrayIcon,
} from "./AutomaticDashboardApp.styled";

const getDashboardId = (state, { params: { splat }, location: { hash } }) =>
  `/auto/dashboard/${splat}${hash.replace(/^#?/, "?")}`;

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
  dashboardId: getDashboardId(state, props),
  isHeaderVisible: getIsHeaderVisible(state),
  tabs: getTabs(state),
});

const mapDispatchToProps = {
  saveDashboard: Dashboards.actions.save,
  invalidateCollections: Collections.actions.invalidateLists,
};

class AutomaticDashboardAppInner extends Component {
  state = {
    savedDashboardId: null,
  };

  componentDidUpdate(prevProps) {
    // scroll to the top when the pathname changes
    if (prevProps.location.pathname !== this.props.location.pathname) {
      window.scrollTo(0, 0);
    }
  }

  save = async () => {
    const { dashboard, triggerToast, saveDashboard, invalidateCollections } =
      this.props;
    // remove the transient id before trying to save
    const { payload: newDashboard } = await saveDashboard(
      dissoc(dashboard, "id"),
    );
    invalidateCollections();
    triggerToast(
      <div className="flex align-center">
        {t`Your dashboard was saved`}
        <Link className="link text-bold ml1" to={Urls.dashboard(newDashboard)}>
          {t`See it`}
        </Link>
      </div>,
      { icon: "dashboard" },
    );

    this.setState({ savedDashboardId: newDashboard.id });
    MetabaseAnalytics.trackStructEvent("AutoDashboard", "Save");
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    // clear savedDashboardId if changing to a different dashboard
    if (this.props.location.pathname !== nextProps.location.pathname) {
      this.setState({ savedDashboardId: null });
    }
  }

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      setParameterValue,
      isHeaderVisible,
    } = this.props;
    const { savedDashboardId } = this.state;
    // pull out "more" related items for displaying as a button at the bottom of the dashboard
    const more = dashboard && dashboard.more;
    const related = dashboard && dashboard.related;

    const hasSidebar = related && Object.keys(related).length > 0;

    return (
      <div
        className={cx("relative AutomaticDashboard", {
          "AutomaticDashboard--withSidebar": hasSidebar,
        })}
      >
        <div className="" style={{ marginRight: hasSidebar ? 346 : undefined }}>
          {isHeaderVisible && (
            <div
              className="bg-white border-bottom"
              data-testid="automatic-dashboard-header"
            >
              <div className="wrapper flex align-center py2">
                <XrayIcon name="bolt" size={24} />
                <div>
                  <h2 className="text-wrap mr2">
                    {dashboard && <TransientTitle dashboard={dashboard} />}
                  </h2>
                  {dashboard && dashboard.transient_filters && (
                    <TransientFilters
                      filter={dashboard.transient_filters}
                      metadata={this.props.metadata}
                    />
                  )}
                </div>
                {savedDashboardId != null ? (
                  <Button className="ml-auto" disabled>{t`Saved`}</Button>
                ) : (
                  <ActionButton
                    className="ml-auto text-nowrap"
                    success
                    borderless
                    actionFn={this.save}
                  >
                    {t`Save this`}
                  </ActionButton>
                )}
              </div>
              {this.props.tabs.length > 1 && (
                <div className="wrapper flex align-center">
                  <DashboardTabs location={this.props.location} />
                </div>
              )}
            </div>
          )}

          <div className="wrapper pb4">
            {parameters && parameters.length > 0 && (
              <div className="px1 pt1">
                <SyncedParametersList
                  className="mt1"
                  parameters={getValuePopulatedParameters(
                    parameters,
                    parameterValues,
                  )}
                  setParameterValue={setParameterValue}
                />
              </div>
            )}
            <Dashboard isXray {...this.props} />
          </div>
          {more && (
            <div className="flex justify-end px4 pb4">
              <Link
                to={more}
                className="ml2"
                onClick={() =>
                  MetabaseAnalytics.trackStructEvent(
                    "AutoDashboard",
                    "ClickMore",
                  )
                }
              >
                <Button iconRight="chevronright">{t`Show more about this`}</Button>
              </Link>
            </div>
          )}
        </div>
        {hasSidebar && (
          <div className="Layout-sidebar absolute top right bottom">
            <SuggestionsSidebar related={related} />
          </div>
        )}
      </div>
    );
  }
}

export const AutomaticDashboardAppConnected = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  DashboardData,
  withToast,
  title(({ dashboard }) => dashboard && dashboard.name),
)(AutomaticDashboardAppInner);

const TransientTitle = ({ dashboard }) =>
  dashboard.transient_name ? (
    <span>{dashboard.transient_name}</span>
  ) : dashboard.name ? (
    <span>{dashboard.name}</span>
  ) : null;

const TransientFilters = ({ filter, metadata }) => (
  <div className="mt1 flex align-center text-medium text-bold">
    {Q.getFilters({ filter }).map((f, index) => (
      <TransientFilter key={index} filter={f} metadata={metadata} />
    ))}
  </div>
);

const TransientFilter = ({ filter, metadata }) => {
  const dimension = getFilterDimension(filter, metadata);

  return (
    <div className="mr3">
      <Icon
        size={12}
        name={getIconForFilter(filter, dimension)}
        className="mr1"
      />
      <Filter filter={filter} metadata={metadata} />
    </div>
  );
};

const getIconForFilter = (filter, dimension) => {
  const field = dimension?.field();

  if (isSegment(filter)) {
    return "star";
  } else if (!field) {
    return "label";
  } else if (field.isDate()) {
    return "calendar";
  } else if (field.isLocation()) {
    return "location";
  } else {
    return "label";
  }
};

const RELATED_CONTENT = {
  compare: {
    title: t`Compare`,
    icon: "compare",
  },
  "zoom-in": {
    title: t`Zoom in`,
    icon: "zoom_in",
  },
  "zoom-out": {
    title: t`Zoom out`,
    icon: "zoom_out",
  },
  related: {
    title: t`Related`,
    icon: "connections",
  },
};

const SuggestionsList = ({ suggestions, section }) => (
  <ListRoot>
    {Object.keys(suggestions).map((s, i) => (
      <li key={i} className="my2">
        <SuggestionSectionHeading>
          {RELATED_CONTENT[s].title}
        </SuggestionSectionHeading>
        {suggestions[s].length > 0 &&
          suggestions[s].map((item, itemIndex) => (
            <ItemLink
              key={itemIndex}
              to={item.url}
              className="hover-parent hover--visibility"
              data-metabase-event={`Auto Dashboard;Click Related;${s}`}
            >
              <Card className="p2" hoverable>
                <ItemContent>
                  <Icon
                    name={RELATED_CONTENT[s].icon}
                    color={color("accent4")}
                    className="mr1"
                  />
                  <h4 className="text-wrap">{item.title}</h4>
                  <ItemDescription className="hover-child">
                    <Tooltip tooltip={item.description}>
                      <Icon name="info_outline" color={color("bg-dark")} />
                    </Tooltip>
                  </ItemDescription>
                </ItemContent>
              </Card>
            </ItemLink>
          ))}
      </li>
    ))}
  </ListRoot>
);

const SuggestionSectionHeading = ({ children }) => (
  <h5
    style={{
      fontWeight: 900,
      textTransform: "uppercase",
      color: color("text-medium"),
    }}
    className="mb1"
  >
    {children}
  </h5>
);
const SuggestionsSidebar = ({ related }) => (
  <SidebarRoot>
    <SidebarHeader>{t`More X-rays`}</SidebarHeader>
    <SuggestionsList suggestions={related} />
  </SidebarRoot>
);
