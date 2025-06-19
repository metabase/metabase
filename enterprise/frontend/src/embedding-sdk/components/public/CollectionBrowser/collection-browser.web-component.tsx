import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";

import {
  CollectionBrowser,
  type CollectionBrowserProps,
} from "./CollectionBrowser";

export type CollectionBrowserWebComponentAttributes = {
  "collection-id": CollectionBrowserProps["collectionId"];
};

const CollectionBrowserWebComponent = createWebComponent<
  Pick<CollectionBrowserProps, "collectionId">
>((props) => <CollectionBrowser {...props} />, {
  props: {
    collectionId: "string",
  },
});

registerWebComponent("collection-browser", CollectionBrowserWebComponent);
