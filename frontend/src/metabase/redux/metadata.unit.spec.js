import Fields from "metabase/entities/fields";

import { fetchField } from "./metadata";

describe("deprecated metadata actions", () => {
  let dispatch;
  beforeEach(() => {
    jest.clearAllMocks();

    dispatch = jest.fn(a => a);
  });

  describe("fetchField", () => {
    it("should fetch a field", async () => {
      Fields.actions.fetch = jest.fn(() =>
        Promise.resolve({
          type: Fields.actionTypes.FETCH_ACTION,
          payload: {
            result: 0,
            entities: {
              fields: {
                0: { id: 0 },
              },
            },
          },
        }),
      );

      await fetchField(0, false)(dispatch);
      expect(Fields.actions.fetch).toHaveBeenCalledWith(
        { id: 0 },
        { reload: false },
      );
      expect(Fields.actions.fetch.mock.calls.length).toBe(1);
    });

    it("should fetch the field associated with a field's dimensions.human_readable_field_id property", async () => {
      Fields.actions.fetch = jest.fn();

      Fields.actions.fetch.mockReturnValueOnce(
        Promise.resolve({
          type: Fields.actionTypes.FETCH_ACTION,
          payload: {
            result: 0,
            entities: {
              fields: {
                0: { id: 0, dimensions: [{ human_readable_field_id: 1 }] },
              },
            },
          },
        }),
      );

      Fields.actions.fetch.mockReturnValueOnce(
        Promise.resolve({
          type: Fields.actionTypes.FETCH_ACTION,
          payload: {
            result: 1,
            entities: {
              fields: {
                0: { id: 0, dimensions: [{ human_readable_field_id: 1 }] },
                1: { id: 1 },
              },
            },
          },
        }),
      );

      await fetchField(0, true)(dispatch);
      expect(Fields.actions.fetch).toHaveBeenCalledWith(
        { id: 0 },
        { reload: true },
      );
      expect(Fields.actions.fetch).toHaveBeenCalledWith(
        { id: 1 },
        { reload: true },
      );
      expect(Fields.actions.fetch.mock.calls.length).toBe(2);
    });
  });
});
