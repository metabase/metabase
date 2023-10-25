import { removeParameter, REMOVE_PARAMETER } from "./parameters";

describe("removeParameter", () => {
  let dispatch;
  let getState;
  beforeEach(() => {
    dispatch = jest.fn();
    getState = () => ({
      dashboard: {
        dashboardId: 1,
        dashboards: {
          1: {
            id: 1,
            parameters: [{ id: 123 }, { id: 456 }],
          },
        },
        parameterValues: {
          123: null,
          456: null,
        },
      },
    });
  });

  it("should return the `parameterId` as `payload.id` (metabase#33826)", async () => {
    const result = await removeParameter(123)(dispatch, getState);
    expect(result).toEqual({
      type: REMOVE_PARAMETER,
      payload: { id: 123 },
    });
  });
});
