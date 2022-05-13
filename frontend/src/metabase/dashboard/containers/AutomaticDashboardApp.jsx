/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";

import title from "metabase/hoc/Title";
import withToast from "metabase/hoc/Toast";
import DashboardData from "metabase/dashboard/hoc/DashboardData";
import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Filter from "metabase/query_builder/components/Filter";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";

import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

import { getMetadata } from "metabase/selectors/metadata";

import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import * as Urls from "metabase/lib/urls";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import * as Q from "metabase/lib/query/query";
import Dimension from "metabase-lib/lib/Dimension";
import { color } from "metabase/lib/colors";

import { dissoc } from "icepick";
import {
  ItemContent,
  ItemDescription,
  ListRoot,
  SidebarHeader,
  SidebarRoot,
} from "./AutomaticDashboardApp.styled";

const getDashboardId = (state, { params: { splat }, location: { hash } }) =>
  `/auto/dashboard/${splat}${hash.replace(/^#?/, "?")}`;

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
  dashboardId: getDashboardId(state, props),
});

const mapDispatchToProps = {
  saveDashboard: Dashboards.actions.save,
  invalidateCollections: Collections.actions.invalidateLists,
};

class AutomaticDashboardAppInner extends React.Component {
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
    const {
      dashboard,
      triggerToast,
      saveDashboard,
      invalidateCollections,
    } = this.props;
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
          <div className="bg-white border-bottom py2">
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr2" size={24} />
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
          </div>

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
            <Dashboard {...this.props} />
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

const AutomaticDashboardApp = _.compose(
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

const TransientFilter = ({ filter, metadata }) => (
  <div className="mr3">
    <Icon size={12} name={getIconForFilter(filter, metadata)} className="mr1" />
    <Filter filter={filter} metadata={metadata} />
  </div>
);

const getIconForFilter = (filter, metadata) => {
  const field = Dimension.parseMBQL(filter[1], metadata).field();
  if (field.isDate()) {
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
            <Link
              hover={{ color: color("brand") }}
              key={itemIndex}
              to={item.url}
              className="block hover-parent hover--visibility"
              data-metabase-event={`Auto Dashboard;Click Related;${s}`}
              mb={1}
            >
              <Card p={2} hoverable>
                <ItemContent>
                  <Icon
                    name={RELATED_CONTENT[s].icon}
                    color={color("accent4")}
                    mr={1}
                    size={22}
                  />
                  <h4 className="text-wrap">{item.title}</h4>
                  <ItemDescription className="hover-child">
                    <Tooltip tooltip={item.description}>
                      <Icon name="question" color={color("bg-dark")} />
                    </Tooltip>
                  </ItemDescription>
                </ItemContent>
              </Card>
            </Link>
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

export default AutomaticDashboardApp;
