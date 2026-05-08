import "mutationobserver-shim";

import { waitFor } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { LegacyApi } from "metabase/api/legacy-client";
import { EntityListLoader } from "metabase/entities/containers/rtk-query";

describe("EntityListLoader", () => {
  let _makeRequest;

  beforeEach(() => {
    _makeRequest = LegacyApi.prototype._makeRequest;
    LegacyApi.prototype._makeRequest = jest
      .fn()
      .mockReturnValue(Promise.resolve({ data: [] }));
  });

  afterEach(() => {
    LegacyApi.prototype._makeRequest = _makeRequest;
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
        expect(LegacyApi.prototype._makeRequest).toHaveBeenCalled();
      });
      expect(
        LegacyApi.prototype._makeRequest.mock.calls.map((c) => c.slice(0, 2)),
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
        expect(LegacyApi.prototype._makeRequest).toHaveBeenCalled();
      });
      expect(
        LegacyApi.prototype._makeRequest.mock.calls.map((c) => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });
  });
});
