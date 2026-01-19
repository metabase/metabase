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

type _VisualizerUiState = VisualizerUiState & {
  setDataSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setVizSettingsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSwapAffordanceVisible: Dispatch<SetStateAction<boolean>>;
};

const VisualizerUiContext = createContext<_VisualizerUiState>({
  isDataSidebarOpen: false,
  isVizSettingsSidebarOpen: false,
  isSwapAffordanceVisible: false,
  setDataSidebarOpen: _.noop,
  setVizSettingsSidebarOpen: _.noop,
  setSwapAffordanceVisible: _.noop,
});

export interface VisualizerUiState {
  isDataSidebarOpen: boolean;
  isVizSettingsSidebarOpen: boolean;
  isSwapAffordanceVisible: boolean;
}

interface VisualizerUiProviderProps {
  children: ReactNode;
  initialUiState?: Partial<VisualizerUiState>;
}

export function VisualizerUiProvider({
  initialUiState = {},
  children,
}: VisualizerUiProviderProps) {
  const [isDataSidebarOpen, setDataSidebarOpen] = useState(
    initialUiState.isDataSidebarOpen ?? true,
  );
  const [isVizSettingsSidebarOpen, setVizSettingsSidebarOpen] = useState(
    initialUiState.isVizSettingsSidebarOpen ?? false,
  );
  const [isSwapAffordanceVisible, setSwapAffordanceVisible] = useState(
    initialUiState.isSwapAffordanceVisible ?? false,
  );

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
