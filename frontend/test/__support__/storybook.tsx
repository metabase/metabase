// Storybook helpers
import { Provider } from "react-redux";

import mainReducers from "metabase/reducers-main";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { getStore } from "./entities-store";
import { TestWrapper } from "./ui";

export const ReduxProvider = ({
  children,
  storeInitialState = {},
}: {
  children: React.ReactNode;
  storeInitialState?: Record<string, any>;
}) => (
  <Provider store={getStore(mainReducers, storeInitialState)}>
    {children}
  </Provider>
);

export const VisualizationWrapper = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  const store = getStore(mainReducers, { settings: createMockSettingsState() });
  return (
    <TestWrapper store={store} withRouter={false} withKBar={false} withDND>
      {children}
    </TestWrapper>
  );
};
