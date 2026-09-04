import React from "react";
import {
  CollectionBrowser,
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

export default function App() {
  const collectionId = 123; // This is the collection ID you want to browse

  return (
    <MetabaseProvider authConfig={authConfig}>
      <CollectionBrowser
        collectionId={collectionId}
        pageSize={10}
        visibleEntityTypes={["dashboard", "question", "collection"]}
      />
    </MetabaseProvider>
  );
}
