import { WebComponentProviders } from "embedding-sdk/components/private/WebComponentProviders/WebComponentProviders";
import { defineWebComponent } from "embedding-sdk/lib/web-components";

import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "../metabase-provider.web-component";

import {
  CollectionBrowser,
  type CollectionBrowserProps,
} from "./CollectionBrowser";

export type CollectionBrowserWebComponentAttributes = {
  "collection-id": string;
  "on-click"?: string;
};

export type CollectionBrowserWebComponentProps = Pick<
  CollectionBrowserProps,
  "collectionId" | "onClick"
>;

export type MetabaseProviderWebComponentProperties = Pick<
  CollectionBrowserProps,
  "onClick"
>;

defineWebComponent<
  MetabaseProviderWebComponentContextProps & CollectionBrowserWebComponentProps,
  MetabaseProviderWebComponentProperties
>(
  "collection-browser",
  ({ container, slot, metabaseProviderProps, ...props }) => (
    <WebComponentProviders metabaseProviderProps={metabaseProviderProps}>
      <CollectionBrowser {...props} />
    </WebComponentProviders>
  ),
  {
    propTypes: {
      ...metabaseProviderContextProps,
      collectionId: "id",
      onClick: "function",
    },
    properties: ["onClick"],
  },
);
