import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card } from "metabase/ui";
import type { WritebackQueryAction } from "metabase-types/api";

type ActionDependenciesContentProps = {
  action: WritebackQueryAction;
  baseUrl: string;
};

export function ActionDependenciesContent({
  action,
  baseUrl,
}: ActionDependenciesContentProps) {
  return (
    <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
      value={{
        baseUrl,
        defaultEntry: { id: action.id, type: "action" },
      }}
    >
      <Card p={0} withBorder flex={1}>
        <Outlet />
      </Card>
    </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
  );
}
