/* @flow */

import React, { Component } from "react";

import { connect } from "react-redux";
import { replace } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";

import screenfull from "screenfull";

import type { LocationDescriptor } from "metabase-types/types";

type Props = {
  dashboardId: string,
  fetchDashboard: (dashboardId: string) => Promise<any>,
  fetchDashboardCardData: () => void,

  location: LocationDescriptor,
  replace: (location: LocationDescriptor) => void,
};

type State = {
  isFullscreen: boolean,
  isNightMode: boolean,
  refreshPeriod: ?number,
  hideParameters: ?string,
};

const TICK_PERIOD = 1; // seconds

/* This contains some state for dashboard controls on both private and embedded dashboards.
 * It should probably be in Redux?
 */
export default (ComposedComponent: ReactClass<any>) =>
  connect(
    null,
    { replace },
  )(
    class extends Component {
      static displayName =
        "DashboardControls[" +
        (ComposedComponent.displayName || ComposedComponent.name) +
        "]";

      props: Props;
      state: State = {
        isFullscreen: false,
        isNightMode: false,

        refreshPeriod: null,

        hideParameters: null,
      };

      _interval: ?number;

      _refreshElapsed: ?number;
      _refreshElapsedHook: ?Function;

      componentWillMount() {
        if (screenfull.enabled) {
          document.addEventListener(
            screenfull.raw.fullscreenchange,
            this._fullScreenChanged,
          );
        }
        this.loadDashboardParams();
      }

      componentDidUpdate() {
        this.updateDashboardParams();
        this._showNav(!this.state.isFullscreen);
      }

      componentWillUnmount() {
        this._showNav(true);
        this._clearRefreshInterval();
        if (screenfull.enabled) {
          document.removeEventListener(
            screenfull.raw.fullscreenchange,
            this._fullScreenChanged,
          );
        }
      }

      loadDashboardParams = () => {
        const { location } = this.props;

        const options = parseHashOptions(location.hash);
        this.setRefreshPeriod(
          Number.isNaN(options.refresh) || options.refresh === 0
            ? null
            : options.refresh,
        );
        this.setNightMode(options.theme === "night" || options.night); // DEPRECATED: options.night
        this.setFullscreen(options.fullscreen);
        this.setHideParameters(options.hide_parameters);
      };

      updateDashboardParams = () => {
        const { location, replace } = this.props;

        const options = parseHashOptions(location.hash);
        const setValue = (name, value) => {
          if (value) {
            options[name] = value;
          } else {
            delete options[name];
          }
        };
        setValue("refresh", this.state.refreshPeriod);
        setValue("fullscreen", this.state.isFullscreen);
        setValue("theme", this.state.isNightMode ? "night" : null);

        delete options.night; // DEPRECATED: options.night

        // Delete the "add card to dashboard" parameter if it's present because we don't
        // want to add the card again on page refresh. The `add` parameter is already handled in
        // DashboardApp before this method is called.
        delete options.add;

        let hash = stringifyHashOptions(options);
        hash = hash ? "#" + hash : "";

        if (hash !== location.hash) {
          replace({
            pathname: location.pathname,
            search: location.search,
            hash,
          });
        }
      };

      setRefreshPeriod = refreshPeriod => {
        this._clearRefreshInterval();
        if (refreshPeriod != null) {
          this._interval = setInterval(
            this._tickRefreshClock,
            TICK_PERIOD * 1000,
          );
          this.setState({ refreshPeriod });
          this.setRefreshElapsed(0);
          MetabaseAnalytics.trackEvent(
            "Dashboard",
            "Set Refresh",
            refreshPeriod,
          );
        } else {
          this.setState({ refreshPeriod: null });
          this.setRefreshElapsed(null);
        }
      };

      setNightMode = isNightMode => {
        isNightMode = !!isNightMode;
        this.setState({ isNightMode });
      };

      setFullscreen = async (isFullscreen, browserFullscreen = true) => {
        isFullscreen = !!isFullscreen;
        if (isFullscreen !== this.state.isFullscreen) {
          if (screenfull.enabled && browserFullscreen) {
            if (isFullscreen) {
              try {
                // Some browsers block this unless it was initiated by user
                // interaction. If it fails, we catch the error since we still
                // want to set the "isFullscreen" option in state.
                await screenfull.request();
              } catch (e) {
                console.warn(`Couldn't enable browser fullscreen: ${e}`);
              }
            } else {
              await screenfull.exit();
            }
          }
          this.setState({ isFullscreen });
        }
      };

      setHideParameters = parameters => {
        this.setState({ hideParameters: parameters });
      };

      _tickRefreshClock = async () => {
        this._refreshElapsed = (this._refreshElapsed || 0) + TICK_PERIOD;
        const { refreshPeriod } = this.state;
        if (refreshPeriod && this._refreshElapsed >= refreshPeriod) {
          this._refreshElapsed = 0;
          await this.props.fetchDashboard(
            this.props.dashboardId,
            this.props.location.query,
          );
          this.props.fetchDashboardCardData({
            reload: true,
            clear: false,
          });
        }
        this.setRefreshElapsed(this._refreshElapsed);
      };

      _clearRefreshInterval() {
        if (this._interval != null) {
          clearInterval(this._interval);
        }
      }

      _showNav(show) {
        // NOTE Atte Keinänen 8/10/17: For some reason `document` object isn't present in Jest tests
        // when _showNav is called for the first time
        if (window.document) {
          const nav = window.document.querySelector(".Nav");
          if (show && nav) {
            nav.classList.remove("hide");
          } else if (!show && nav) {
            nav.classList.add("hide");
          }
        }
      }

      _fullScreenChanged = () => {
        this.setState({ isFullscreen: !!screenfull.isFullscreen });
      };

      setRefreshElapsedHook = hook => {
        this._refreshElapsedHook = hook;
      };

      setRefreshElapsed = elapsed => {
        if (this._refreshElapsedHook) {
          this._refreshElapsedHook(elapsed);
        }
      };

      render() {
        return (
          <ComposedComponent
            {...this.props}
            {...this.state}
            setRefreshElapsedHook={this.setRefreshElapsedHook}
            loadDashboardParams={this.loadDashboardParams}
            updateDashboardParams={this.updateDashboardParams}
            onNightModeChange={this.setNightMode}
            onFullscreenChange={this.setFullscreen}
            onRefreshPeriodChange={this.setRefreshPeriod}
          />
        );
      }
    },
  );
