import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card } from "metabase/ui";
import * as Urls from "metabase/urls";

import type { LibraryItemRef } from "../../types";

type LibraryItemDependenciesProps = LibraryItemRef;

export function LibraryItemDependencies(itemRef: LibraryItemDependenciesProps) {
  return (
    <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
      value={{
        baseUrl: getDependenciesUrl(itemRef),
        defaultEntry: { id: itemRef.item.id, type: itemRef.model },
      }}
    >
      <Card p={0} withBorder flex={1}>
        <Outlet />
      </Card>
    </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
  );
}

// `DashboardId` admits a string and `DocumentId` does not, so the two URL
// builders cannot share one signature
function getDependenciesUrl(itemRef: LibraryItemRef): string {
  switch (itemRef.model) {
    case "dashboard":
      return Urls.dataStudioDashboardDependencies(itemRef.item.id);
    case "document":
      return Urls.dataStudioDocumentDependencies(itemRef.item.id);
  }
}
