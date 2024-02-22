/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import screenfull from "screenfull";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";

const TICK_PERIOD = 1; // seconds

/* This contains some state for dashboard controls on both private and embedded dashboards.
 * It should probably be in Redux?
 *
 * @deprecated HOCs are deprecated
 */
export const DashboardControls = ComposedComponent =>
  connect(null, { replace })(
    class extends Component {
      static displayName =
        "DashboardControls[" +
        (ComposedComponent.displayName || ComposedComponent.name) +
        "]";

      state = {
        isFullscreen: false,
        theme: null,

        refreshPeriod: null,

        hideParameters: null,
      };

      UNSAFE_componentWillMount() {
        if (screenfull.enabled) {
          document.addEventListener(
            screenfull.raw.fullscreenchange,
            this._fullScreenChanged,
          );
        }
        this.loadDashboardParams();
      }

      componentDidUpdate(prevProps) {
        if (prevProps.location !== this.props.location) {
          this.syncUrlHashToState();
        } else {
          this.syncStateToUrlHash();
        }
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
        this.setTheme(options.theme);
        this.setFullscreen(options.fullscreen);
        this.setHideParameters(options.hide_parameters);
      };

      syncUrlHashToState() {
        const { location } = this.props;

        const { refresh, fullscreen, theme } = parseHashOptions(location.hash);
        this.setRefreshPeriod(refresh);
        this.setFullscreen(fullscreen);
        this.setTheme(theme);
      }

      syncStateToUrlHash = () => {
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
        setValue("theme", this.state.theme);

        delete options.night; // DEPRECATED: options.night

        // Delete the "add card to dashboard" and "editing mode" parameters
        // if they are present because we do not want to add the card again on
        // page refresh. The parameters are already handled in DashboardApp
        // before this method is called.
        delete options.add;
        delete options.edit;

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
          MetabaseAnalytics.trackStructEvent(
            "Dashboard",
            "Set Refresh",
            refreshPeriod,
          );
        } else {
          this.setState({ refreshPeriod: null });
          this.setRefreshElapsed(null);
        }
      };

      // Preserve existing behavior, while keeping state in a new `theme` key
      setNightMode = isNightMode => {
        const theme = isNightMode ? "night" : null;
        this.setState({ theme });
      };

      setTheme = theme => {
        this.setState({ theme });
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
          await this.props.fetchDashboard({
            dashId: this.props.dashboardId,
            queryParams: this.props.location.query,
            options: { preserveParameters: true },
          });
          this.props.fetchDashboardCardData({
            isRefreshing: true,
            reload: true,
            clearCache: false,
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
          const nav =
            document.body.querySelector("[data-testid='main-navbar-root']") ||
            document.body.querySelector("[data-testid='admin-navbar-root']");

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
            isNightMode={this.state.theme === "night"}
            hasNightModeToggle={this.state.theme !== "transparent"}
            setRefreshElapsedHook={this.setRefreshElapsedHook}
            loadDashboardParams={this.loadDashboardParams}
            onNightModeChange={this.setNightMode}
            onFullscreenChange={this.setFullscreen}
            onRefreshPeriodChange={this.setRefreshPeriod}
          />
        );
      }
    },
  );
