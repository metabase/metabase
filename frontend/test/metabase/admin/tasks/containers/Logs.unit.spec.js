import React from "react";
import Logs from "metabase/admin/tasks/containers/Logs";
import { render, screen } from "@testing-library/react";
import mock from "xhr-mock";

import { UtilApi } from "metabase/services";

describe("Logs", () => {
  describe("log fetching", () => {
    beforeEach(() => mock.setup());
    afterEach(() => mock.teardown());

    it("should call UtilApi.logs after 1 second", () => {
      jest.useFakeTimers();
      mock.get("/api/util/logs", {
        body: JSON.stringify([]),
      });
      render(<Logs />);
      const utilSpy = jest.spyOn(UtilApi, "logs");

      screen.getByText("Loading...");
      jest.advanceTimersByTime(1001);
      expect(utilSpy).toHaveBeenCalled();
    });
  });
});
