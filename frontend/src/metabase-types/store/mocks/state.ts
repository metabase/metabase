import { State } from "metabase-types/store";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockAdminState } from "./admin";
import { createMockAppState } from "./app";
import { createMockDashboardState } from "./dashboard";
import { createMockNormalizedEntitiesState } from "./entities";
import { createMockEmbedState } from "./embed";
import { createMockMetabotState } from "./metabot";
import { createMockParametersState } from "./parameters";
import { createMockQueryBuilderState } from "./qb";
import { createMockSettingsState } from "./settings";
import { createMockSetupState } from "./setup";
import { createMockUploadState } from "./upload";
import { createMockUndoState } from "./undo";

export const createMockState = (opts?: Partial<State>): State => ({
  admin: createMockAdminState(),
  app: createMockAppState(),
  currentUser: createMockUser(),
  dashboard: createMockDashboardState(),
  embed: createMockEmbedState(),
  entities: createMockNormalizedEntitiesState(),
  metabot: createMockMetabotState(),
  parameters: createMockParametersState(),
  qb: createMockQueryBuilderState(),
  settings: createMockSettingsState(),
  setup: createMockSetupState(),
  upload: createMockUploadState(),
  undo: createMockUndoState(),
  ...opts,
});
