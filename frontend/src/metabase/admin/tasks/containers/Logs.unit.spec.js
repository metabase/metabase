import fetchMock from "fetch-mock";
import { render, screen } from "@testing-library/react";
import Logs from "metabase/admin/tasks/containers/Logs";

import { UtilApi } from "metabase/services";

describe("Logs", () => {
  describe("log fetching", () => {
    it("should call UtilApi.logs after 1 second", () => {
      jest.useFakeTimers();
      fetchMock.get("path:/api/util/logs", []);
      render(<Logs />);
      const utilSpy = jest.spyOn(UtilApi, "logs");

      screen.getByText("Loading...");
      jest.advanceTimersByTime(1001);
      expect(utilSpy).toHaveBeenCalled();
    });
  });
});
