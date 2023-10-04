import fetchMock from "fetch-mock";
import { render, screen } from "@testing-library/react";
import { UtilApi } from "metabase/services";
import { Logs } from "./Logs";

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
