import React from "react";
import { mount } from "enzyme";

import TokenField from "../../src/metabase/components/TokenField";

import { delay } from '../../src/metabase/lib/promise';

import {
    KEYCODE_ENTER,
} from "metabase/lib/keyboard";

const MockValue = ({ value }) => <span>{value}</span>
const MockOption = ({ option }) => <span>{option}</span>

class TokenFieldWithStateAndDefaults extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value || []
    };
  }
  render() {
    // allow overriding everything except value and onChange which we provide
    const { value, onChange, ...props } = this.props;
    return (
      <TokenField
          options={[]}
          value={this.state.value}
          onChange={(value) => { this.setState({ value }); if (onChange) { onChange(value); } }}
          valueKey={option => option}
          labelKey={option => option}
          valueRenderer={(value) => <MockValue value={value} />}
          optionRenderer={(option) => <MockOption option={option} />}
          layoutRenderer={({ valuesList, optionsList }) =>
            <div>
              {valuesList}
              {optionsList}
            </div>
          }
          {...props}
      />
    )
  }
}

describe("TokenField", () => {
    it("should render with no options or values", () => {
        const component = mount(<TokenFieldWithStateAndDefaults />)
        expect(component.find(MockValue).length).toEqual(0)
        expect(component.find(MockOption).length).toEqual(0)
    })
    it("should render with 1 options and 1 values", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={["foo"]}
          options={["bar"]}
        />)
        expect(component.find(MockValue).length).toEqual(1)
        expect(component.find(MockOption).length).toEqual(1)
    })
    it("shouldn't show previous used option by default", () => {
      const component = mount(<TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["foo"]}
      />)
        expect(component.find(MockOption).length).toEqual(0)
    })
    it("should show previous used option if removeSelected={false} is provided", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={["foo"]}
          options={["foo"]}
          removeSelected={false}
        />)
        expect(component.find(MockOption).length).toEqual(1)
    })
    it("should filter correctly", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={["foo"]}
          options={["bar", "baz"]}
        />)
        const input = component.find("input");
        input.simulate("focus");

        input.simulate("change", { target: { value: "nope" } });
        expect(component.find(MockOption).length).toEqual(0)
        input.simulate("change", { target: { value: "bar" } });
        expect(component.find(MockOption).length).toEqual(1)
    })

    it("should add freeform value if parseFreeformValue is provided", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={[]}
          options={["bar", "baz"]}
          parseFreeformValue={(value) => value}
        />)
        const input = component.find("input");
        input.simulate("focus");

        input.simulate("change", { target: { value: "yep" } });
        expect(component.state().value).toEqual([]);
        input.simulate("keydown", { keyCode: KEYCODE_ENTER })
        expect(component.state().value).toEqual(["yep"]);
    })

    it("should add option when clicked", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={[]}
          options={["bar", "baz"]}
        />)
        expect(component.state().value).toEqual([])
        component.find(MockOption).first().simulate("click");
        expect(component.state().value).toEqual(["bar"])
    })

    it("should hide the added option", async () => {
      const component = mount(<TokenFieldWithStateAndDefaults
        value={[]}
        options={["bar", "baz"]}
      />)
      expect(component.find(MockOption).length).toEqual(2);
      component.find(MockOption).first().simulate("click");
      await delay(100)
      expect(component.find(MockOption).length).toEqual(1);
    })

    it("should add option when filtered and clicked", () => {
        const component = mount(<TokenFieldWithStateAndDefaults
          value={[]}
          options={["foo", "bar"]}
        />)
        const input = component.find("input");
        input.simulate("focus");

        expect(component.state().value).toEqual([]);
        input.simulate("change", { target: { value: "ba" } });
        component.find(MockOption).first().simulate("click");
        expect(component.state().value).toEqual(["bar"])
    })

    describe("when updateOnInputChange is provided", () => {
      it("should add freeform value immediately if updateOnInputChange is provided", () => {
          const component = mount(<TokenFieldWithStateAndDefaults
            options={["bar", "baz"]}
            multi
            parseFreeformValue={(value) => value}
            updateOnInputChange
          />)
          const input = component.find("input");
          input.simulate("focus");

          input.simulate("change", { target: { value: "yep" } });
          expect(component.state().value).toEqual(["yep"])
      })

      it("should only add one option when filtered and clicked",async () => {
          const component = mount(<TokenFieldWithStateAndDefaults
            options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
            multi
            parseFreeformValue={(value) => value}
            updateOnInputChange
          />)
          const input = component.find("input");
          input.simulate("focus");

          expect(component.state().value).toEqual([]);
          input.simulate("change", { target: { value: "Do" } });
          expect(component.state().value).toEqual(["Do"])

          // click the first option
          component.find(MockOption).first().simulate("click");
          expect(component.state().value).toEqual(["Doohickey"])
          expect(input.props().value).toEqual("Do")
      })

      it("should only add one option when filtered and enter is pressed",async () => {
          const component = mount(<TokenFieldWithStateAndDefaults
            options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
            multi
            parseFreeformValue={(value) => value}
            updateOnInputChange
          />)
          const input = component.find("input");
          input.simulate("focus");

          expect(component.state().value).toEqual([]);
          input.simulate("change", { target: { value: "Do" } });
          expect(component.state().value).toEqual(["Do"])

          // press enter
          input.simulate("keydown", { keyCode: KEYCODE_ENTER })
          expect(component.state().value).toEqual(["Doohickey"])
          expect(input.props().value).toEqual("Do")
      })

      it("shouldn't hide option matching input freeform value", () => {
          const component = mount(<TokenFieldWithStateAndDefaults
            options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
            multi
            parseFreeformValue={(value) => value}
            updateOnInputChange
          />)
          const input = component.find("input");
          input.simulate("focus");

          expect(component.find(MockOption).length).toEqual(4);
          input.simulate("change", { target: { value: "Doohickey" } });
          expect(component.state().value).toEqual(["Doohickey"])
          expect(component.find(MockOption).length).toEqual(1);
      })

      it("should commit after typing an option and hitting enter", () => {
          const component = mount(<TokenFieldWithStateAndDefaults
            options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
            multi
            parseFreeformValue={(value) => value}
            updateOnInputChange
          />)
          const input = component.find("input");
          input.simulate("focus");

          expect(component.find(MockOption).length).toEqual(4);
          input.simulate("change", { target: { value: "Doohickey" } });
          expect(component.state().value).toEqual(["Doohickey"])

          input.simulate("keydown", { keyCode: KEYCODE_ENTER })
          expect(component.find(MockValue).length).toEqual(1);
          expect(component.find(MockOption).length).toEqual(3);
      })
    })
})
