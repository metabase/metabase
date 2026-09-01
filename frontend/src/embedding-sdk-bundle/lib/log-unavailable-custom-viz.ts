import type { ToastArgs } from "metabase/common/hooks";

// The SDK renders no toast host, so unavailable custom viz warnings
// go to the console instead.
export const logUnavailableCustomVizMessage = ({ message }: ToastArgs) => {
  console.warn(message);
};
