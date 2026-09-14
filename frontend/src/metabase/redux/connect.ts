import {
  // eslint-disable-next-line no-restricted-imports
  connect as _connect,
} from "react-redux";

import { metabaseReduxContext } from "metabase/redux-context";

export const connect: typeof _connect = (
  mapStateToProps?: any,
  mapDispatchToProps?: any,
  mergeProps?: any,
  options?: any,
) => {
  return _connect(mapStateToProps, mapDispatchToProps, mergeProps, {
    context: metabaseReduxContext,
    ...options,
  });
};
