import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import { createMockState } from "metabase/redux/store/mocks";

import {
  MAX_UPLOAD_STRING,
  UPLOAD_FILE_CLEAR,
  UPLOAD_FILE_END,
  UPLOAD_FILE_ERROR,
  UPLOAD_FILE_START,
  uploadFile,
} from "./uploads";

const now = Date.now();

const NOTIFICATION_DELAY = 9000;

const mockUploadCSV = (valid = true) => {
  fetchMock.post(
    "path:/api/upload/csv",
    valid
      ? new Response(JSON.stringify(3), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : {
          throws: { data: { message: "It's dead Jim" } },
        },
  );
};

const mockAppendCSV = (valid = true) => {
  fetchMock.post(
    "glob:*/api/table/*/append-csv",
    valid
      ? new Response(JSON.stringify(3), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : {
          throws: { data: { message: "It's dead Jim" } },
        },
  );
};

// Asserts the matching request was sent as multipart form data — locks down
// that table.ts hands the FormData through unwrapped (a JSON-stringified
// `{ formData }` would set Content-Type: application/json instead).
const expectMultipartBody = (urlSuffix) => {
  const call = fetchMock.callHistory
    .calls()
    .find((c) => c.url.endsWith(urlSuffix));
  expect(call).toBeDefined();
  const headers = call.options?.headers ?? {};
  const contentType =
    headers instanceof Headers
      ? headers.get("content-type")
      : (headers["content-type"] ?? headers["Content-Type"]);
  // Either absent (browser sets it with the multipart boundary) or multipart;
  // application/json would mean FormData got JSON-stringified.
  expect(contentType ?? "").not.toMatch(/application\/json/);
};

const mockReplaceCSV = (valid = true) => {
  fetchMock.post(
    "glob:*/api/table/*/replace-csv",
    valid
      ? new Response(JSON.stringify(3), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : {
          throws: { data: { message: "It's dead Jim" } },
        },
  );
};

describe("csv uploads", () => {
  describe("actions", () => {
    const store = getMainStore(createMockState());
    const dispatch = jest.spyOn(store, "dispatch");

    const file = new File(
      [new Blob(["col1, col2 \n val1, val2"])],
      "test.csv",
      {
        type: "text/csv",
      },
    );

    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true }).setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should handle file upload success", async () => {
      mockUploadCSV();

      await uploadFile({ file, collectionId: "root", uploadMode: "create" })(
        dispatch,
      );
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_START,
        payload: {
          id: now,
          name: "test.csv",
          collectionId: "root",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_END,
        payload: {
          id: now,
          uploadMode: "create",
          modelId: 3,
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_CLEAR,
        payload: {
          id: now,
        },
      });
    });

    it("should handle file append success", async () => {
      mockAppendCSV();

      await uploadFile({ file, tableId: 123, uploadMode: "append" })(dispatch);
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

      expectMultipartBody("append-csv");

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_START,
        payload: {
          id: now,
          name: "test.csv",
          tableId: 123,
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_END,
        payload: {
          id: now,
          modelId: 3,
          uploadMode: "append",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_CLEAR,
        payload: {
          id: now,
        },
      });
    });

    it("should handle file replace success", async () => {
      mockReplaceCSV();

      await uploadFile({ file, tableId: 123, uploadMode: "replace" })(dispatch);
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

      expectMultipartBody("replace-csv");

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_START,
        payload: {
          id: now,
          name: "test.csv",
          tableId: 123,
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_END,
        payload: {
          id: now,
          modelId: 3,
          uploadMode: "replace",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_CLEAR,
        payload: {
          id: now,
        },
      });
    });

    it("should handle file upload error", async () => {
      mockUploadCSV(false);

      await uploadFile({ file, collectionId: "root", uploadMode: "create" })(
        dispatch,
      );
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_START,
        payload: {
          id: now,
          name: "test.csv",
          collectionId: "root",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_ERROR,
        payload: {
          id: now,
          error: "It's dead Jim",
        },
      });
    });

    it("Error on oversized files", async () => {
      const bigFile = new File([""], "test.csv");
      Object.defineProperty(bigFile, "size", { value: 200 * 1024 * 1024 + 1 });
      await uploadFile({
        file: bigFile,
        collectionId: "root",
        uploadMode: "create",
      })(dispatch);
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_START,
        payload: {
          id: now,
          name: "test.csv",
          collectionId: "root",
        },
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: UPLOAD_FILE_ERROR,
        payload: {
          id: now,
          message: `You cannot upload files larger than ${MAX_UPLOAD_STRING} MB`,
        },
      });
    });
  });
});
