import React, { useCallback, useEffect, useState } from "react";
import _ from "underscore";

import { Dashboard } from "metabase-types/api";
import { ApplyButton } from "./withAutoApplyFilters.styled";

type ParameterValues = Record<string, any>;

interface WithAutoApplyFiltersProps {
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

    const [state, setState] = useState<{
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
