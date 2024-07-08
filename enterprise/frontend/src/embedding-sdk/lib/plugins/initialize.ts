import { flow } from "lodash";

import { initializeDashboardPlugin } from "embedding-sdk/lib/plugins/dashboard";

export const initializePlugins = flow([initializeDashboardPlugin]);
