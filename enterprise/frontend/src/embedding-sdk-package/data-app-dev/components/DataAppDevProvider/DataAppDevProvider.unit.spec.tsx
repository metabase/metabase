import { render, screen } from "@testing-library/react";

import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

import { DataAppDevProvider } from "./DataAppDevProvider";

jest.mock(
  "embedding-sdk-package/components/public/MetabaseProvider/MetabaseProvider",
  () => ({
    MetabaseProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  }),
);

describe("DataAppDevProvider", () => {
  it("registers the data-app dev context for the bundle realm and renders children", () => {
    render(
      <DataAppDevProvider
        appSlug="sales"
        authConfig={{ metabaseInstanceUrl: "http://localhost:3000" }}
      >
        <div>app content</div>
      </DataAppDevProvider>,
    );

    expect(screen.getByText("app content")).toBeInTheDocument();
    expect(
      ensureMetabaseProviderPropsStore().getState().internalProps.dataApp,
    ).toEqual({ name: "sales", isDev: true });
  });
});
