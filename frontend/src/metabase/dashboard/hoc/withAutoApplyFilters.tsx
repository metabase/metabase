import React, { useCallback, useEffect, useState } from "react";
import _ from "underscore";

import { Dashboard } from "metabase-types/api";
import { ApplyButton } from "./withAutoApplyFilters.styled";

// XXX: Use similar type as in https://github.com/metabase/metabase/blob/c56d0872ac2a2cf44a827acfa1af5e8b76dcaa7d/frontend/src/metabase-lib/parameters/utils/cards.ts#L17
type ParameterValues = Record<string, any>;

interface WithAutoApplyFiltersProps {
  // XXX: Fix types
  dashboard: Dashboard;
  parameterValues: ParameterValues;
  setParameterValue: (id: string, value: any) => void;
  setParameterValues: (parameterValues: ParameterValues) => void;
  fetchDashboardCardData: ({
    reload,
    clear,
    ignoreCache,
  }: {
    reload?: boolean;
    clear?: boolean;
    ignoreCache?: boolean;
  }) => void;
}

export default function withAutoApplyFilters<T>(
  Component: React.ComponentType<T>,
) {
  return function WithAutoApplyFilters(props: T & WithAutoApplyFiltersProps) {
    const {
      dashboard,
      parameterValues,
      setParameterValue,
      setParameterValues,
      fetchDashboardCardData,
    } = props;

    // XXX: control parameterValues and dashboard to be changed at the same time, otherwise
    // the logic inside <Dashboard />'s `componentDidUpdate` will be triggered twice,
    // causing the dashboard cards to be fetched twice, when there'are parameters
    // in the query params.
    const [state, setState] = useState<{
      // XXX: Fix types
      dashboard: Dashboard;
      parameterValues: ParameterValues;
    }>({ dashboard, parameterValues });

    useEffect(() => {
      setState(state => {
        return {
          ...state,
          parameterValues,
        };
      });
    }, [parameterValues]);

    useEffect(() => {
      setState(state => {
        return {
          ...state,
          dashboard,
        };
      });
    }, [dashboard]);

    const handleParameterValue = useCallback(
      (id, value) => {
        const isAutoApplyFilters = props.dashboard?.auto_apply_filters;
        if (isAutoApplyFilters) {
          setParameterValue(id, value);
        } else {
          setState((state: any) => {
            return {
              ...state,
              parameterValues: {
                ...state.parameterValues,
                [id]: value,
              },
            };
          });
        }
      },
      [props.dashboard?.auto_apply_filters, setParameterValue],
    );

    const hasUnappliedFilters = !_.isEqual(
      parameterValues,
      state.parameterValues,
    );

    const handleApplyFilters = () => {
      setParameterValues(state.parameterValues);
      // XXX: This is needed since the logic to reload the dashboard is in `<Dashboard />`
      // but now we pass `parameterValues` from the state of this HoC instead, so calling
      // `fetchDashboardCardData` inside `<Dashboard />` won't do anything since the redux
      // state hasn't changed.
      fetchDashboardCardData({ reload: false, clear: true });
    };

    const applyFilterButton = !dashboard?.auto_apply_filters && (
      <ApplyButton
        primary
        isVisible={hasUnappliedFilters}
        onClick={handleApplyFilters}
      >
        Apply
      </ApplyButton>
    );

    return (
      <Component
        {...props}
        dashboard={state.dashboard}
        parameterValues={state.parameterValues}
        setParameterValue={handleParameterValue}
        applyFilterButton={applyFilterButton}
      />
    );
  };
}
