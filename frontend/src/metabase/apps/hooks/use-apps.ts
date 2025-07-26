// import { uuid } from "metabase/lib/uuid";

import { uuid } from "metabase/lib/uuid";

import { SystemComponentId } from "../const/systemComponents";
import type { ComponentConfiguration } from "../types";

const LOCAL_STORAGE_KEY = "metabase.apps";

function getApps(): ComponentConfiguration[] {
  const apps = localStorage.getItem(LOCAL_STORAGE_KEY);
  return apps ? JSON.parse(apps) : [];
}

export function useApps() {
  return getApps();
}

export function useCustomComponents() {
  const apps = useApps();
  return apps.filter((app) => app.type === "component");
}

export function useSaveApp() {
  return (app: ComponentConfiguration) => {
    const apps = getApps();

    const index = apps.findIndex(
      (a: ComponentConfiguration) => a.id === app.id,
    );

    if (index === -1) {
      apps.push(app);
    } else {
      apps[index] = app;
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(apps));
  };
}

export function useApp(id?: string) {
  return getComponentById(id);
}

export function getComponentById(id?: string) {
  if (id) {
    const apps = getApps();
    return apps.find((a: ComponentConfiguration) => a.id === id);
  }
}

export function getInitialComponentConfiguration() {
  return {
    root: createPlaceholderComponent(),
    id: uuid(),
    type: "component",
    title: "Untitled Component",
    context: "none",
  };
}

export function createPlaceholderComponent() {
  return {
    id: uuid(),
    componentId: SystemComponentId.Placeholder,
  };
}
