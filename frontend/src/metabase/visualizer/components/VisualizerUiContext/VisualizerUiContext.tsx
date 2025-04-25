import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getDatasets } from "metabase/visualizer/selectors";
import type { VisualizerDataSourceId } from "metabase-types/api";

type VisualizerUiState = {
  isDataSidebarOpen: boolean;
  isVizSettingsSidebarOpen: boolean;
  isSwapAffordanceVisible: boolean;
  expandedDataSources: Record<VisualizerDataSourceId, boolean>;

  setDataSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setVizSettingsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSwapAffordanceVisible: Dispatch<SetStateAction<boolean>>;
  setDataSourceExpanded: (
    sourceId: VisualizerDataSourceId,
    isExpanded: boolean,
  ) => void;
  toggleDataSourceExpanded: (sourceId: VisualizerDataSourceId) => void;
};

const VisualizerUiContext = createContext<VisualizerUiState>({
  isDataSidebarOpen: false,
  isVizSettingsSidebarOpen: false,
  isSwapAffordanceVisible: false,
  expandedDataSources: {},
  setDataSidebarOpen: _.noop,
  setVizSettingsSidebarOpen: _.noop,
  setSwapAffordanceVisible: _.noop,
  setDataSourceExpanded: _.noop,
  toggleDataSourceExpanded: _.noop,
});

interface VisualizerUiProviderProps {
  initialDataSources?: VisualizerDataSourceId[];
  children: ReactNode;
}

export function VisualizerUiProvider({
  initialDataSources = [],
  children,
}: VisualizerUiProviderProps) {
  const [isDataSidebarOpen, setDataSidebarOpen] = useState(true);
  const [isVizSettingsSidebarOpen, setVizSettingsSidebarOpen] = useState(false);
  const [isSwapAffordanceVisible, setSwapAffordanceVisible] = useState(false);
  const [expandedDataSources, setExpandedDataSources] = useState(
    getInitiallyExpandedDataSources(initialDataSources),
  );

  const dataSourceCount = useSelector(
    (state) => Object.keys(getDatasets(state)).length,
  );
  const previousDataSourceCount = usePrevious(dataSourceCount) ?? 0;

  useEffect(() => {
    if (dataSourceCount === 0 && previousDataSourceCount > 0) {
      setVizSettingsSidebarOpen(false);
      setSwapAffordanceVisible(false);
      setExpandedDataSources({});
    }
  }, [dataSourceCount, previousDataSourceCount]);

  const setDataSourceExpanded = useCallback(
    (sourceId: VisualizerDataSourceId, isExpanded: boolean) => {
      setExpandedDataSources((expandedDataSources) => {
        return {
          ...expandedDataSources,
          [sourceId]: isExpanded,
        };
      });
    },
    [],
  );

  const toggleDataSourceExpanded = useCallback(
    (sourceId: VisualizerDataSourceId) => {
      setExpandedDataSources((expandedDataSources) => {
        return {
          ...expandedDataSources,
          [sourceId]: !expandedDataSources[sourceId],
        };
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      isDataSidebarOpen,
      isVizSettingsSidebarOpen,
      isSwapAffordanceVisible,
      expandedDataSources,
      setDataSidebarOpen,
      setVizSettingsSidebarOpen,
      setSwapAffordanceVisible,
      setDataSourceExpanded,
      toggleDataSourceExpanded,
    }),
    [
      expandedDataSources,
      isDataSidebarOpen,
      isSwapAffordanceVisible,
      isVizSettingsSidebarOpen,
      setDataSourceExpanded,
      toggleDataSourceExpanded,
    ],
  );

  return (
    <VisualizerUiContext.Provider value={value}>
      {children}
    </VisualizerUiContext.Provider>
  );
}

export function useVisualizerUi() {
  return useContext(VisualizerUiContext);
}

function getInitiallyExpandedDataSources(
  initialDataSources: VisualizerDataSourceId[],
) {
  return initialDataSources.reduce(
    (acc, sourceId) => {
      acc[sourceId] = true;
      return acc;
    },
    {} as Record<VisualizerDataSourceId, boolean>,
  );
}
