import { t } from "ttag";

import { createBenchAdminRouteGuard } from "metabase/bench/components/utils";
import type { BenchNavItem } from "metabase/bench/constants/navigation";
import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";

import { SHARED_LIB_IMPORT_PATH } from "./constants";
import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";

export function getBenchRoutes() {
  return (
    <Route
      path="library/:path"
      component={createBenchAdminRouteGuard(
        "transforms-python",
        PythonLibraryEditorPage,
      )}
    />
  );
}

export function getBenchNavItems(isAdmin: boolean): BenchNavItem[] {
  if (!isAdmin) {
    return [];
  }

  return [
    {
      id: "library",
      url: Urls.transformPythonLibrary({ path: SHARED_LIB_IMPORT_PATH }),
      icon: "code_block",
      getLabel: () => t`Python Library`,
      getDescription: () =>
        t`A customizable function library for use with your Python transforms.`,
    },
  ];
}
