import fetchMock from "fetch-mock";

import {
  uploadFile,
  UPLOAD_FILE_CLEAR,
  UPLOAD_FILE_END,
  UPLOAD_FILE_ERROR,
  UPLOAD_FILE_START,
  MAX_UPLOAD_STRING,
} from "./uploads";

const now = Date.now();

const NOTIFICATION_DELAY = 9000;

const mockUploadCSV = (valid = true) => {
  fetchMock.post(
    "path:/api/card/from-csv",
    valid
      ? "3"
      : {
          throws: { data: { message: "It's dead Jim" } },
        },
  );
};

const mockAppendCSV = (valid = true) => {
  fetchMock.post(
    "glob:*/api/table/*/append-csv",
    valid
      ? "3"
      : {
          throws: { data: { message: "It's dead Jim" } },
        },
  );
};

describe("csv uploads", () => {
  describe("actions", () => {
    let dispatch;
    const file = new File(
      [new Blob(["col1, col2 \n val1, val2"])],
      "test.csv",
      {
        type: "text/csv",
      },
    );

    beforeEach(() => {
      dispatch = jest.fn();
      jest.useFakeTimers({ advanceTimers: true }).setSystemTime(now);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it("should handle file upload success", async () => {
      mockUploadCSV();

      await uploadFile({ file, collectionId: "root" })(dispatch);
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

      await uploadFile({ file, tableId: 123 })(dispatch);
      jest.advanceTimersByTime(NOTIFICATION_DELAY);

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

      await uploadFile({ file, collectionId: "root" })(dispatch);
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
      await uploadFile({ file: bigFile, collectionId: "root" })(dispatch);
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
