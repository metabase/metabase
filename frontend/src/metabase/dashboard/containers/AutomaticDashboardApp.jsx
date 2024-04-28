/* eslint-disable react/prop-types */
import cx from "classnames";
import { dissoc } from "icepick";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";
import Card from "metabase/components/Card";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import { DashboardData } from "metabase/dashboard/hoc/DashboardData";
import { getIsHeaderVisible, getTabs } from "metabase/dashboard/selectors";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import title from "metabase/hoc/Title";
import withToast from "metabase/hoc/Toast";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon } from "metabase/ui";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { FixedWidthContainer } from "../components/Dashboard/Dashboard.styled";
import { DashboardTabs } from "../components/DashboardTabs";

import {
  ItemContent,
  ItemDescription,
  ItemLink,
  ListRoot,
  SidebarHeader,
  SidebarRoot,
  SuggestionsSidebarWrapper,
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
      <div className={cx(CS.flex, CS.alignCenter)}>
        {t`Your dashboard was saved`}
        <Link
          className={cx(CS.link, CS.textBold, CS.ml1)}
          to={Urls.dashboard(newDashboard)}
        >
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
        className={cx(CS.relative, "AutomaticDashboard", {
          "AutomaticDashboard--withSidebar": hasSidebar,
        })}
      >
        <div className="" style={{ marginRight: hasSidebar ? 346 : undefined }}>
          {isHeaderVisible && (
            <div
              className={cx(CS.bgWhite, CS.borderBottom)}
              data-testid="automatic-dashboard-header"
            >
              <div className={CS.wrapper}>
                <FixedWidthContainer
                  data-testid="fixed-width-dashboard-header"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  <div className={cx(CS.flex, CS.alignCenter, CS.py2)}>
                    <XrayIcon name="bolt" size={24} />
                    <div>
                      <h2 className={cx(CS.textWrap, CS.mr2)}>
                        {dashboard && <TransientTitle dashboard={dashboard} />}
                      </h2>
                    </div>
                    {savedDashboardId != null ? (
                      <Button className={CS.mlAuto} disabled>{t`Saved`}</Button>
                    ) : (
                      <ActionButton
                        className={cx(CS.mlAuto, CS.textNoWrap)}
                        success
                        borderless
                        actionFn={this.save}
                      >
                        {t`Save this`}
                      </ActionButton>
                    )}
                  </div>
                  {this.props.tabs.length > 1 && (
                    <div className={cx(CS.wrapper, CS.flex, CS.alignCenter)}>
                      <DashboardTabs location={this.props.location} />
                    </div>
                  )}
                </FixedWidthContainer>
              </div>
            </div>
          )}

          <div className={cx(CS.wrapper, CS.pb4)}>
            {parameters && parameters.length > 0 && (
              <div className={cx(CS.px1, CS.pt1)}>
                <FixedWidthContainer
                  data-testid="fixed-width-filters"
                  isFixedWidth={dashboard?.width === "fixed"}
                >
                  <SyncedParametersList
                    className={CS.mt1}
                    parameters={getValuePopulatedParameters({
                      parameters,
                      values: parameterValues,
                    })}
                    setParameterValue={setParameterValue}
                  />
                </FixedWidthContainer>
              </div>
            )}
            <Dashboard isXray {...this.props} />
          </div>
          {more && (
            <div className={cx(CS.flex, CS.justifyEnd, CS.px4, CS.pb4)}>
              <Link
                to={more}
                className={CS.ml2}
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
          <SuggestionsSidebarWrapper
            className={cx(CS.absolute, CS.top, CS.right, CS.bottom)}
          >
            <SuggestionsSidebar related={related} />
          </SuggestionsSidebarWrapper>
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
      <li key={i} className={CS.my2}>
        <SuggestionSectionHeading>
          {RELATED_CONTENT[s].title}
        </SuggestionSectionHeading>
        {suggestions[s].length > 0 &&
          suggestions[s].map((item, itemIndex) => (
            <ItemLink
              key={itemIndex}
              to={item.url}
              className={cx(CS.hoverParent, CS.hoverVisibility)}
            >
              <Card className={CS.p2} hoverable>
                <ItemContent>
                  <Icon
                    name={RELATED_CONTENT[s].icon}
                    color={color("accent4")}
                    className={CS.mr1}
                  />
                  <h4 className={CS.textWrap}>{item.title}</h4>
                  <ItemDescription className={CS.hoverChild}>
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
    className={CS.mb1}
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
