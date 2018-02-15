/* eslint-disable react/display-name */

import React from "react";
import { mount } from "enzyme";

import TokenField from "../../src/metabase/components/TokenField";

import { delay } from '../../src/metabase/lib/promise';

import {
    KEYCODE_DOWN,
    KEYCODE_TAB,
    KEYCODE_ENTER,
    KEYCODE_COMMA
} from "metabase/lib/keyboard"

const DEFAULT_OPTIONS = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const MockValue = ({ value }) => <span>{value}</span>
const MockOption = ({ option }) => <span>{option}</span>

const DEFAULT_TOKEN_FIELD_PROPS = {
  options: [],
  value: [],
  valueKey: option => option,
  labelKey: option => option,
  valueRenderer: (value) => <MockValue value={value} />,
  optionRenderer: (option) => <MockOption option={option} />,
  layoutRenderer: ({ valuesList, optionsList }) =>
    <div>
      {valuesList}
      {optionsList}
    </div>
}

class TokenFieldWithStateAndDefaults extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value || []
    };
  }
  render() {
    // allow overriding everything except value and onChange which we provide
    // eslint-disable-next-line no-unused-vars
    const { value, onChange, ...props } = this.props;
    return (
      <TokenField
          {...DEFAULT_TOKEN_FIELD_PROPS}
          {...props}
          value={this.state.value}
          onChange={(value) => { this.setState({ value }); if (onChange) { onChange(value); } }}
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
      let component, input;
      beforeEach(() => {
        component = mount(<TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={(value) => value || null}
          updateOnInputChange
        />)
        input = component.find("input");
      })
      function focusAndType(str) {
        input.simulate("focus");
        input.simulate("change", { target: { value: str } });
      }
      function blur() {
        input.simulate("blur");
      }

      it("should add freeform value immediately if updateOnInputChange is provided", () => {
          focusAndType("yep");
          expect(component.state().value).toEqual(["yep"])
      })

      it("should only add one option when filtered and clicked",async () => {
          expect(component.state().value).toEqual([]);
          focusAndType("Do")
          expect(component.state().value).toEqual(["Do"])

          // click the first option
          component.find(MockOption).first().simulate("click");
          expect(component.state().value).toEqual(["Doohickey"])
          expect(input.props().value).toEqual("Do")
      })

      it("should only add one option when filtered and enter is pressed",async () => {
          expect(component.state().value).toEqual([]);
          focusAndType("Do");
          expect(component.state().value).toEqual(["Do"])

          // press enter
          input.simulate("keydown", { keyCode: KEYCODE_ENTER })
          expect(component.state().value).toEqual(["Doohickey"])
          expect(input.props().value).toEqual("Do")
      })

      it("shouldn't hide option matching input freeform value", () => {
          expect(component.find(MockOption).length).toEqual(4);
          focusAndType("Doohickey");
          expect(component.state().value).toEqual(["Doohickey"])
          expect(component.find(MockOption).length).toEqual(1);
      })

      it("should commit after typing an option and hitting enter", () => {
          expect(component.find(MockOption).length).toEqual(4);
          focusAndType("Doohickey");
          expect(component.state().value).toEqual(["Doohickey"])

          input.simulate("keydown", { keyCode: KEYCODE_ENTER })
          expect(component.find(MockValue).length).toEqual(1);
          expect(component.find(MockOption).length).toEqual(3);
      })

      it("should not commit empty freeform value", () => {
        focusAndType("Doohickey");
        focusAndType("");
        blur();
        expect(component.state().value).toEqual([])
        expect(component.find(MockValue).length).toEqual(0);
      })
    })

    describe('key selection', () => {
        [KEYCODE_TAB, KEYCODE_ENTER, KEYCODE_COMMA].map(key =>
            it(`should allow the user to use arrow keys and then ${key} to select a recipient`, () => {
                const spy = jest.fn()

                const component = mount(
                    <TokenField
                        {...DEFAULT_TOKEN_FIELD_PROPS}
                        options={DEFAULT_OPTIONS}
                        onChange={spy}
                    />
                )

                const input = component.find("input")

                // limit our options by typing
                input.simulate("focus");
                input.simulate('change', { target: { value: 'G' }})

                // the initially selected option should be the first option
                expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[1])

                input.simulate('keydown', {
                    keyCode: KEYCODE_DOWN,
                    preventDefault: jest.fn()
                })

                // the next possible option should be selected now
                expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[2])

                input.simulate('keydown', {
                    keyCode: key,
                    preventDefalut: jest.fn()
                })

                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith([DEFAULT_OPTIONS[2]])
            })
        )
    })

    describe("with multi=true", () => {
      it("should prevent blurring on tab", () => {
        const preventDefault = jest.fn()
        const component = mount(<TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={(value) => value || null}
          updateOnInputChange
          multi
        />)
        const input = component.find("input");
        input.simulate("focus");
        input.simulate("change", { target: { value: "asdf" } });
        input.simulate("keydown", { keyCode: KEYCODE_TAB, preventDefault: preventDefault })
        expect(preventDefault).toHaveBeenCalled();
      })
    })
    describe("with multi=false", () => {
      it("should not prevent blurring on tab", () => {
        const preventDefault = jest.fn()
        const component = mount(<TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={(value) => value || null}
          updateOnInputChange
        />)
        const input = component.find("input");
        input.simulate("focus");
        input.simulate("change", { target: { value: "asdf" } });
        input.simulate("keydown", { keyCode: KEYCODE_TAB, preventDefault: preventDefault })
        expect(preventDefault).not.toHaveBeenCalled();
      })
    })
})
