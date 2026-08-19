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
  const collectionId = "Mn4OpQrStUvWxYzAbCdEf"; // Entity ID of the collection you want people to browse. A sequential ID like 14 works too.

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
