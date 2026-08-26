import { ReduxProvider } from "__support__/storybook";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { SyncProgressModal } from "./SyncProgressModal";

export default {
  title: "Enterprise/RemoteSync/SyncProgressModal",
  component: SyncProgressModal,
};

const initialState = createMockState({
  currentUser: createMockUser({ is_superuser: true }),
});

const noop = () => {};

export const Stalled = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="export"
      progress={0.3}
      isStalled
      minutesSinceLastUpdate={6}
      isError={false}
      errorMessage=""
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);

export const InProgress = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="export"
      progress={0.3}
      isError={false}
      errorMessage=""
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);
