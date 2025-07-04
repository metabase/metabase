import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

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

const CollectionBrowserWebComponent =
  createWebComponent<CollectionBrowserWebComponentProps>(
    ({ container, slot, ...props }) => <CollectionBrowser {...props} />,
    {
      propTypes: {
        collectionId: "id",
        onClick: "function",
      },
    },
  );

registerWebComponent("collection-browser", CollectionBrowserWebComponent);
