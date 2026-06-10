import { browserHistory } from "react-router";

import { getBasename } from "metabase/data_apps/router";

export const dataAppRouting = {
  getBasename,
  navigate: (to: string) => browserHistory.push(getBasename() + to),
  subscribe: (callback: () => void) => browserHistory.listen(callback),
};
