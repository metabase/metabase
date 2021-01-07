import React from "react";
import Logs from "metabase/admin/tasks/containers/Logs";
import { render, screen } from "@testing-library/react";

import { UtilApi } from "metabase/services";

describe("Logs", () => {
  describe("log fetching", () => {
    it("should call UtilApi.logs after 1 second", () => {
      jest.useFakeTimers();
      render(<Logs />);
      const utilSpy = jest.spyOn(UtilApi, "logs");

      screen.getByText("Loading...");
      jest.runTimersToTime(1001);
      expect(utilSpy).toHaveBeenCalled();
    });
  });
});
