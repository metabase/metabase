import React from "react";
import { shallow, mount } from "enzyme";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

describe("LoadingAndErrorWrapper", () => {
  describe("Loading", () => {
    it("should display a loading message if given a true loading prop", () => {
      const wrapper = shallow(<LoadingAndErrorWrapper loading={true} />);

      expect(wrapper.text()).toMatch(/Loading/);
    });

    it("should display a given child if loading is false", () => {
      const Child = () => <div>Hey</div>;

      const wrapper = shallow(
        <LoadingAndErrorWrapper loading={false} error={null}>
          {() => <Child />}
        </LoadingAndErrorWrapper>,
      );
      expect(wrapper.find(Child).length).toEqual(1);
    });

    it("should display a given scene during loading", () => {
      const Scene = () => <div>Fun load animation</div>;

      const wrapper = shallow(
        <LoadingAndErrorWrapper
          loading={true}
          error={null}
          loadingScenes={[<Scene />]}
        />,
      );

      expect(wrapper.find(Scene).length).toEqual(1);
    });

    describe("cycling", () => {
      it("should cycle through loading messages if provided", () => {
        jest.useFakeTimers();

        const interval = 6000;

        const wrapper = mount(
          <LoadingAndErrorWrapper
            loading={true}
            error={null}
            loadingMessages={["One", "Two", "Three"]}
            messageInterval={interval}
          />,
        );

        const instance = wrapper.instance();
        const spy = jest.spyOn(instance, "cycleLoadingMessage");

        expect(wrapper.text()).toMatch(/One/);

        jest.runTimersToTime(interval);
        expect(spy).toHaveBeenCalled();
        expect(wrapper.text()).toMatch(/Two/);

        jest.runTimersToTime(interval);
        expect(spy).toHaveBeenCalled();
        expect(wrapper.text()).toMatch(/Three/);

        jest.runTimersToTime(interval);
        expect(spy).toHaveBeenCalled();
        expect(wrapper.text()).toMatch(/One/);
      });
    });
  });

  describe("Errors", () => {
    it("should display an error message if given an error object", () => {
      const error = {
        type: 500,
        message: "Big error here folks",
      };

      const wrapper = mount(
        <LoadingAndErrorWrapper loading={true} error={error} />,
      );

      expect(wrapper.text()).toMatch(error.message);
    });
  });
});
