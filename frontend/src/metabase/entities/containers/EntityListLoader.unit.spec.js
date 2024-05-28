import { renderWithProviders } from "__support__/ui";
import "mutationobserver-shim";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import { Api } from "metabase/lib/api";

describe("EntityListLoader", () => {
  let _makeRequest;

  beforeEach(() => {
    _makeRequest = Api.prototype._makeRequest;
    Api.prototype._makeRequest = jest.fn().mockReturnValue(Promise.resolve([]));
  });

  afterEach(() => {
    Api.prototype._makeRequest = _makeRequest;
  });

  describe("with entityType of search", () => {
    it("should handle object entityQuery", async () => {
      renderWithProviders(
        <EntityListLoader
          entityType="search"
          entityQuery={{ collection: "foo" }}
        />,
      );
      expect(
        Api.prototype._makeRequest.mock.calls.map(c => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });

    it("should handle function entityQuery", async () => {
      renderWithProviders(
        <EntityListLoader
          entityType="search"
          entityQuery={(state, props) => ({ collection: props.collectionId })}
          collectionId="foo"
        />,
      );
      expect(
        Api.prototype._makeRequest.mock.calls.map(c => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });
  });
});
