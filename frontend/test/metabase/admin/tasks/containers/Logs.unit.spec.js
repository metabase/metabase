import React from "react";
import { render, screen } from "@testing-library/react";
import nock from "nock";
import Logs from "metabase/admin/tasks/containers/Logs";

import { UtilApi } from "metabase/services";

describe("Logs", () => {
  describe("log fetching", () => {
    afterEach(() => nock.cleanAll());

    it("should call UtilApi.logs after 1 second", () => {
      jest.useFakeTimers();
      nock.get("/api/util/logs").reply(200, []);
      render(<Logs />);
      const utilSpy = jest.spyOn(UtilApi, "logs");

      screen.getByText("Loading...");
      jest.advanceTimersByTime(1001);
      expect(utilSpy).toHaveBeenCalled();
    });
  });
});
