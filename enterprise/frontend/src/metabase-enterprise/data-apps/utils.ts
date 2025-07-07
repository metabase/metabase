import { slugify } from "metabase/lib/formatting/url";

import type { DataApp } from "./types";

export function createMockDataApp(opts: Partial<DataApp> = {}): DataApp {
  return {
    name: "Untitled",
    url: slugify(opts.name || "Untitled"),
    status: "private", // private, published, archived
    ...opts,
  };
}

export const DataAppsListMock = [
  createMockDataApp({
    id: "aaaaa",
    name: "Super App",
    url: "super-app",
  }),
];

export function getDataAppById(idToFind: string | undefined) {
  return DataAppsListMock.find(({ id }) => id === idToFind);
}
