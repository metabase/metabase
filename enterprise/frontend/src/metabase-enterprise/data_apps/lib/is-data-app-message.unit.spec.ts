import {
  DATA_APP_ERROR_MESSAGE_TYPE,
  DATA_APP_READY_MESSAGE_TYPE,
} from "../constants";

import { isDataAppMessage } from "./is-data-app-message";

describe("isDataAppMessage", () => {
  it("accepts an object tagged with the given type, whatever else it carries", () => {
    expect(
      isDataAppMessage(
        { type: DATA_APP_ERROR_MESSAGE_TYPE, notReady: true },
        DATA_APP_ERROR_MESSAGE_TYPE,
      ),
    ).toBe(true);

    expect(
      isDataAppMessage(
        { type: DATA_APP_READY_MESSAGE_TYPE },
        DATA_APP_READY_MESSAGE_TYPE,
      ),
    ).toBe(true);
  });

  it("rejects a different message type, so the two handshakes can't be confused", () => {
    expect(
      isDataAppMessage(
        { type: DATA_APP_READY_MESSAGE_TYPE },
        DATA_APP_ERROR_MESSAGE_TYPE,
      ),
    ).toBe(false);
  });

  it.each([
    null,
    undefined,
    "metabase.data-app.ready",
    42,
    [],
    {},
    { type: undefined },
    { notReady: true },
  ])(
    "rejects %p, which isn't a tagged object — the frame can post arbitrary data",
    (data) => {
      expect(isDataAppMessage(data, DATA_APP_READY_MESSAGE_TYPE)).toBe(false);
    },
  );
});
