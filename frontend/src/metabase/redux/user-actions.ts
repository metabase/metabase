import { createAction } from "@reduxjs/toolkit";

import type { User } from "metabase-types/api";

/**
 * Action dispatched when a user is updated.
 * Extracted to a separate file to avoid circular dependency with metabase/api/user.
 */
export const userUpdated = createAction<User>("metabase/user/UPDATED");
