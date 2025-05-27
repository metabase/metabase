import React from "react";
import { CollectionBrowser } from "@metabase/embedding-sdk-react";

export default function App() {
  const collectionId = 123; // This is the collection ID you want to browse
  const handleItemClick = item => {
    console.log("Clicked item:", item);
  };

  return (
    <CollectionBrowser
      collectionId={collectionId}
      onClick={handleItemClick}
      pageSize={10}
      // Define the collection item types you want to be visible
      visibleEntityTypes={["dashboard", "question", "collection"]}
    />
  );
}
