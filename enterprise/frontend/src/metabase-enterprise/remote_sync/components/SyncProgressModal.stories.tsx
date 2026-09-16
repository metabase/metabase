import { createMockState } from "__support__/state";
import { ReduxProvider } from "__support__/storybook";
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

const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

const initiatedByUser = {
  id: 1,
  first_name: "Cynthia",
  last_name: "Balusek",
  email: "cynthia@example.com",
};

export const InProgress = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="export"
      progress={0.3}
      startedAt={startedAt}
      initiatedByUser={initiatedByUser}
      isError={false}
      errorMessage=""
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);

export const Quiet = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="import"
      progress={0.8}
      isQuiet
      minutesSinceLastUpdate={3}
      startedAt={startedAt}
      initiatedByUser={initiatedByUser}
      isError={false}
      errorMessage=""
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);

export const Interrupted = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="import"
      progress={0.32}
      isStalled
      minutesSinceLastUpdate={13}
      startedAt={startedAt}
      initiatedByUser={initiatedByUser}
      isError={false}
      errorMessage=""
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);

export const Cancelled = () => (
  <ReduxProvider storeInitialState={initialState}>
    <SyncProgressModal
      taskType="import"
      progress={0.21}
      isCancelled
      startedAt={startedAt}
      initiatedByUser={null}
      isError={false}
      errorMessage="Sync was interrupted: the server stopped responding for 5 minutes (it may have restarted)"
      isSuccess={false}
      outcome={null}
      onDismiss={noop}
    />
  </ReduxProvider>
);
