import type { DataAppLinkProps } from "metabase/data_apps/router";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Internal navigation link inside a data app.
 *
 * @function
 * @category DataAppRouter
 */
export const DataAppLink = ({ to, children, ...rest }: DataAppLinkProps) => {
  const DataAppLink = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataAppLink;

  if (!DataAppLink) {
    return children;
  }

  return (
    <DataAppLink to={to} {...rest}>
      {children}
    </DataAppLink>
  );
};
