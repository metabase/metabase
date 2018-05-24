import React from "react";
import Logs from "../../src/metabase/components/Logs";
import { mount } from "enzyme";

import { UtilApi } from "metabase/services";

describe("Logs", () => {
  describe("log fetching", () => {
    it("should call UtilApi.logs after 1 second", () => {
      jest.useFakeTimers();
      const wrapper = mount(<Logs />);
      const utilSpy = jest.spyOn(UtilApi, "logs");

      expect(wrapper.state().logs.length).toEqual(0);
      jest.runTimersToTime(1001);
      expect(utilSpy).toHaveBeenCalled();
    });
  });
});
