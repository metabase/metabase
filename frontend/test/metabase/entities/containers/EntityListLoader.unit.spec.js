import React from "react";

import { mount } from "enzyme";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import { Provider } from "react-redux";

import entitiesReducer from "metabase/redux/entities";
import { getStore } from "metabase/store";
import { Api } from "metabase/lib/api";

const MockEntityProvider = ({ children }) => (
  <Provider store={getStore({ entities: entitiesReducer })}>
    {children}
  </Provider>
);

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
      mount(
        <MockEntityProvider>
          <EntityListLoader
            entityType="search"
            entityQuery={{ collection: "foo" }}
          />
        </MockEntityProvider>,
      );
      expect(
        Api.prototype._makeRequest.mock.calls.map(c => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });

    it("should handle function entityQuery", async () => {
      mount(
        <MockEntityProvider>
          <EntityListLoader
            entityType="search"
            entityQuery={(state, props) => ({ collection: props.collectionId })}
            collectionId="foo"
          />
        </MockEntityProvider>,
      );
      expect(
        Api.prototype._makeRequest.mock.calls.map(c => c.slice(0, 2)),
      ).toEqual([["GET", "/api/collection/foo/items"]]);
    });
  });
});
