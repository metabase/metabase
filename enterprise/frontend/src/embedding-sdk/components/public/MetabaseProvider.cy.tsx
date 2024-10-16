/* eslint-disable no-literal-metabase-strings --- test code :shrugs: */
//importing from node_modules should work if we also have  different/normal webpack config file for the component testin
// it fails with this setup
// import { MetabaseProvider } from "@metabase/embedding-sdk-react";

import { Badge } from "@mantine/core";
// importing a simple component works
import { TestComponent } from "./test";

// i can't get it to work when importing from the source code, even if technically we're using the same webpack config
import { MetabaseProvider } from "./MetabaseProvider";

describe("ComponentName.cy.jsx", () => {
  it("playground", () => {
    cy.mount(
      <div>
        <h1>Hello, World!</h1>
        <Badge color="blue">Badge</Badge>
        {/* simple local component that seems to work */}
        <TestComponent />
        {/* metabase provider makes cypress explode */}
        {/* <MetabaseProvider
          config={{
            metabaseInstanceUrl: "http://localhost:3000",
            jwtProviderUri: "http//localhost:8888",
          }}
        >
          <div>MetabaseProvider</div>
        </MetabaseProvider> */}
      </div>,
    );
  });
});
