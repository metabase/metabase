import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getDatasets } from "metabase/visualizer/selectors";

type VisualizerUiState = {
  isDataSidebarOpen: boolean;
  isVizSettingsSidebarOpen: boolean;
  isSwapAffordanceVisible: boolean;

  setDataSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setVizSettingsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSwapAffordanceVisible: Dispatch<SetStateAction<boolean>>;
};

const VisualizerUiContext = createContext<VisualizerUiState>({
  isDataSidebarOpen: false,
  isVizSettingsSidebarOpen: false,
  isSwapAffordanceVisible: false,
  setDataSidebarOpen: _.noop,
  setVizSettingsSidebarOpen: _.noop,
  setSwapAffordanceVisible: _.noop,
});

interface VisualizerUiProviderProps {
  children: ReactNode;
}

export function VisualizerUiProvider({ children }: VisualizerUiProviderProps) {
  const [isDataSidebarOpen, setDataSidebarOpen] = useState(true);
  const [isVizSettingsSidebarOpen, setVizSettingsSidebarOpen] = useState(false);
  const [isSwapAffordanceVisible, setSwapAffordanceVisible] = useState(false);

  const dataSourceCount = useSelector(
    (state) => Object.keys(getDatasets(state)).length,
  );
  const previousDataSourceCount = usePrevious(dataSourceCount) ?? 0;

  useEffect(() => {
    if (dataSourceCount === 0 && previousDataSourceCount > 0) {
      setVizSettingsSidebarOpen(false);
      setSwapAffordanceVisible(false);
    }
  }, [dataSourceCount, previousDataSourceCount]);

  const value = useMemo(
    () => ({
      isDataSidebarOpen,
      isVizSettingsSidebarOpen,
      isSwapAffordanceVisible,
      setDataSidebarOpen,
      setVizSettingsSidebarOpen,
      setSwapAffordanceVisible,
    }),
    [isDataSidebarOpen, isSwapAffordanceVisible, isVizSettingsSidebarOpen],
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
