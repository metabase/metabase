import "mutationobserver-shim";

import { waitFor } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { EntityListLoader } from "metabase/entities/containers/rtk-query";
import { Api } from "metabase/lib/api";

describe("EntityListLoader", () => {
  let _makeRequest;

  beforeEach(() => {
    _makeRequest = Api.prototype._makeRequest;
    Api.prototype._makeRequest = jest
      .fn()
      .mockReturnValue(Promise.resolve({ data: [] }));
  });

  afterEach(() => {
    Api.prototype._makeRequest = _makeRequest;
  });

  describe("with entityType of search", () => {
    const MockComponent = () => <div>Mock Component</div>;

    it("should handle object entityQuery", async () => {
      renderWithProviders(
        <EntityListLoader
          entityType="search"
          entityQuery={{ collection: "foo" }}
          ComposedComponent={MockComponent}
        />,
      );
      await waitFor(() => {
        expect(Api.prototype._makeRequest).toHaveBeenCalled();
      });
      expect(
        Api.prototype._makeRequest.mock.calls.map((c) => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });

    it("should handle function entityQuery", async () => {
      renderWithProviders(
        <EntityListLoader
          entityType="search"
          entityQuery={(state, props) => ({ collection: props.collectionId })}
          collectionId="foo"
          ComposedComponent={MockComponent}
        />,
      );
      await waitFor(() => {
        expect(Api.prototype._makeRequest).toHaveBeenCalled();
      });
      expect(
        Api.prototype._makeRequest.mock.calls.map((c) => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });
  });
});
