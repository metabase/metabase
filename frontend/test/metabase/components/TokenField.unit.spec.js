/* eslint-disable react/display-name */

import React from "react";
import { mount } from "enzyme";

import TokenField from "metabase/components/TokenField";

import { delay } from "metabase/lib/promise";

import {
  KEYCODE_DOWN,
  KEYCODE_TAB,
  KEYCODE_ENTER,
  KEY_COMMA,
} from "metabase/lib/keyboard";

const DEFAULT_OPTIONS = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const MockValue = ({ value }) => <span>{value}</span>;
const MockOption = ({ option }) => <span>{option}</span>;

const DEFAULT_TOKEN_FIELD_PROPS = {
  options: [],
  value: [],
  valueKey: option => option,
  labelKey: option => option,
  valueRenderer: value => <MockValue value={value} />,
  optionRenderer: option => <MockOption option={option} />,
  layoutRenderer: ({ valuesList, optionsList }) => (
    <div>
      {valuesList}
      {optionsList}
    </div>
  ),
};

class TokenFieldWithStateAndDefaults extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value || [],
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
        onChange={value => {
          this.setState({ value });
          if (onChange) {
            onChange(value);
          }
        }}
      />
    );
  }
}

describe("TokenField", () => {
  let component;
  const input = () => component.find("input");
  const value = () => component.state().value;
  const options = () => component.find(MockOption).map(o => o.text());
  const values = () => component.find(MockValue).map(v => v.text());
  const blur = () => input().simulate("blur");
  const focus = () => input().simulate("focus");
  const type = str => input().simulate("change", { target: { value: str } });
  const focusAndType = str => focus() && type(str);
  const keyDown = keyCode => input().simulate("keydown", { keyCode });
  const clickOption = (n = 0) =>
    component
      .find(MockOption)
      .at(n)
      .simulate("click");

  afterEach(() => {
    component = null;
  });

  it("should render with no options or values", () => {
    component = mount(<TokenFieldWithStateAndDefaults />);
    expect(values()).toEqual([]);
    expect(options()).toEqual([]);
  });
  it("should render with 1 options and 1 values", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={["foo"]} options={["bar"]} />,
    );
    expect(values()).toEqual(["foo"]);
    expect(options()).toEqual(["bar"]);
  });
  it("shouldn't show previous used option by default", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={["foo"]} options={["foo"]} />,
    );
    expect(options()).toEqual([]);
  });
  it("should show previous used option if removeSelected={false} is provided", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["foo"]}
        removeSelected={false}
      />,
    );
    expect(options()).toEqual(["foo"]);
  });
  it("should filter correctly", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["bar", "baz"]}
      />,
    );
    focusAndType("nope");
    expect(options()).toEqual([]);
    type("bar");
    expect(options()).toEqual(["bar"]);
  });

  it("should add freeform value if parseFreeformValue is provided", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults
        value={[]}
        options={["bar", "baz"]}
        parseFreeformValue={value => value}
      />,
    );
    focusAndType("yep");
    expect(value()).toEqual([]);
    keyDown(KEYCODE_ENTER);
    expect(value()).toEqual(["yep"]);
  });

  it("should add option when clicked", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={[]} options={["bar", "baz"]} />,
    );
    expect(value()).toEqual([]);
    clickOption(0);
    expect(value()).toEqual(["bar"]);
  });

  it("should hide the added option", async () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={[]} options={["bar", "baz"]} />,
    );
    expect(options()).toEqual(["bar", "baz"]);
    clickOption(0);
    await delay(100);
    expect(options()).toEqual(["baz"]);
  });

  it("should add option when filtered and clicked", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={[]} options={["foo", "bar"]} />,
    );

    focus();
    expect(value()).toEqual([]);
    type("ba");
    clickOption(0);
    expect(value()).toEqual(["bar"]);
  });

  it("should type a character that's on the comma key", () => {
    component = mount(
      <TokenFieldWithStateAndDefaults value={[]} options={["fooбar"]} />,
    );

    focus();
    type("foo");
    // 188 is comma on most layouts
    input().simulate("keydown", { keyCode: 188, key: "б" });
    // if that keydown was interpreted as a comma, the value would be "fooбar"
    expect(input().props().value).toEqual("foo");
  });

  describe("when updateOnInputChange is provided", () => {
    beforeEach(() => {
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
    });

    it("should add freeform value immediately if updateOnInputChange is provided", () => {
      focusAndType("yep");
      expect(value()).toEqual(["yep"]);
    });

    it("should only add one option when filtered and clicked", async () => {
      expect(value()).toEqual([]);
      focusAndType("Do");
      expect(value()).toEqual(["Do"]);

      clickOption(0);
      expect(value()).toEqual(["Doohickey"]);
      expect(input().props().value).toEqual("");
    });

    it("should only add one option when filtered and enter is pressed", async () => {
      expect(value()).toEqual([]);
      focusAndType("Do");
      expect(value()).toEqual(["Do"]);

      // press enter
      keyDown(KEYCODE_ENTER);
      expect(value()).toEqual(["Doohickey"]);
      expect(input().props().value).toEqual("");
    });

    it("shouldn't hide option matching input freeform value", () => {
      expect(options()).toEqual(DEFAULT_OPTIONS);
      focusAndType("Doohickey");
      expect(value()).toEqual(["Doohickey"]);
      expect(options()).toEqual(["Doohickey"]);
    });

    it("should commit after typing an option and hitting enter", () => {
      expect(options()).toEqual(DEFAULT_OPTIONS);
      focusAndType("Doohickey");
      expect(value()).toEqual(["Doohickey"]);

      keyDown(KEYCODE_ENTER);
      expect(values()).toEqual(["Doohickey"]);
      expect(options()).toEqual(["Gadget", "Gizmo", "Widget"]);
    });

    it("should not commit empty freeform value", () => {
      focusAndType("Doohickey");
      focusAndType("");
      blur();
      expect(value()).toEqual([]);
      expect(values()).toEqual([]);
    });

    it("should hide the input but not clear the search after accepting an option", () => {
      focusAndType("G");
      expect(options()).toEqual(["Gadget", "Gizmo"]);
      keyDown(KEYCODE_ENTER);
      expect(options()).toEqual(["Gizmo"]);
      expect(input().props().value).toEqual("");
    });

    it("should reset the search when focusing", () => {
      focusAndType("G");
      expect(options()).toEqual(["Gadget", "Gizmo"]);
      keyDown(KEYCODE_ENTER);
      expect(options()).toEqual(["Gizmo"]);
      focus();
      expect(options()).toEqual(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should reset the search when adding the last option", () => {
      focusAndType("G");
      expect(options()).toEqual(["Gadget", "Gizmo"]);
      keyDown(KEYCODE_ENTER);
      expect(options()).toEqual(["Gizmo"]);
      keyDown(KEYCODE_ENTER);
      expect(options()).toEqual(["Doohickey", "Widget"]);
    });

    it("should hide the option if typed exactly then press enter", () => {
      focusAndType("Gadget");
      expect(options()).toEqual(["Gadget"]);
      keyDown(KEYCODE_ENTER);
      expect(values()).toEqual(["Gadget"]);
      expect(options()).toEqual(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then press enter", () => {
      focusAndType("Gad");
      expect(options()).toEqual(["Gadget"]);
      keyDown(KEYCODE_ENTER);
      expect(values()).toEqual(["Gadget"]);
      expect(options()).toEqual(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed exactly then clicked", () => {
      focusAndType("Gadget");
      expect(options()).toEqual(["Gadget"]);
      clickOption(0);
      expect(values()).toEqual(["Gadget"]);
      expect(options()).toEqual(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then clicked", () => {
      focusAndType("Gad");
      expect(options()).toEqual(["Gadget"]);
      clickOption(0);
      expect(values()).toEqual(["Gadget"]);
      expect(options()).toEqual(["Doohickey", "Gizmo", "Widget"]);
    });
  });

  describe("when updateOnInputBlur is false", () => {
    beforeEach(() => {
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputBlur={false}
        />,
      );
    });

    it("should not add freeform value immediately", () => {
      focusAndType("yep");
      expect(value()).toEqual([]);
    });
    it("should not add freeform value when blurring", () => {
      focusAndType("yep");
      blur();
      expect(value()).toEqual([]);
    });
  });

  describe("when updateOnInputBlur is true", () => {
    beforeEach(() => {
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputBlur={true}
        />,
      );
    });

    it("should not add freeform value immediately", () => {
      focusAndType("yep");
      expect(value()).toEqual([]);
    });
    it("should add freeform value when blurring", () => {
      focusAndType("yep");
      blur();
      expect(value()).toEqual(["yep"]);
    });
  });

  describe("key selection", () => {
    [
      ["keyCode", KEYCODE_TAB],
      ["keyCode", KEYCODE_ENTER],
      ["key", KEY_COMMA],
    ].map(([keyType, keyValue]) =>
      it(`should allow the user to use arrow keys and then ${keyType}: ${keyValue} to select a recipient`, () => {
        const spy = jest.fn();

        component = mount(
          <TokenField
            {...DEFAULT_TOKEN_FIELD_PROPS}
            options={DEFAULT_OPTIONS}
            onChange={spy}
          />,
        );

        // limit our options by typing
        focusAndType("G");

        // the initially selected option should be the first option
        expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[1]);

        input().simulate("keydown", {
          keyCode: KEYCODE_DOWN,
          preventDefault: jest.fn(),
        });

        // the next possible option should be selected now
        expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[2]);

        input().simulate("keydown", {
          [keyType]: keyValue,
          preventDefalut: jest.fn(),
        });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith([DEFAULT_OPTIONS[2]]);
      }),
    );
  });

  describe("with multi=true", () => {
    it("should prevent blurring on tab", () => {
      const preventDefault = jest.fn();
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
          multi
        />,
      );
      focusAndType("asdf");
      input().simulate("keydown", {
        keyCode: KEYCODE_TAB,
        preventDefault: preventDefault,
      });
      expect(preventDefault).toHaveBeenCalled();
    });
    it('should paste "1,2,3" as multiple values', () => {
      const preventDefault = jest.fn();
      component = mount(
        <TokenFieldWithStateAndDefaults
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
          multi
        />,
      );
      input().simulate("paste", {
        clipboardData: {
          getData: () => "1,2,3",
        },
        preventDefault,
      });
      expect(values()).toEqual(["1", "2", "3"]);
      // prevent pasting into <input>
      expect(preventDefault).toHaveBeenCalled();
    });
  });
  describe("with multi=false", () => {
    it("should not prevent blurring on tab", () => {
      const preventDefault = jest.fn();
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
      focusAndType("asdf");
      input().simulate("keydown", {
        keyCode: KEYCODE_TAB,
        preventDefault: preventDefault,
      });
      expect(preventDefault).not.toHaveBeenCalled();
    });
    it('should paste "1,2,3" as one value', () => {
      const preventDefault = jest.fn();
      component = mount(
        <TokenFieldWithStateAndDefaults
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
      input().simulate("paste", {
        clipboardData: {
          getData: () => "1,2,3",
        },
        preventDefault,
      });
      expect(values()).toEqual(["1,2,3"]);
      // prevent pasting into <input>
      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe("custom layoutRenderer", () => {
    let layoutRenderer;
    beforeEach(() => {
      layoutRenderer = jest
        .fn()
        .mockImplementation(({ valuesList, optionsList }) => (
          <div>
            {valuesList}
            {optionsList}
          </div>
        ));
      component = mount(
        <TokenFieldWithStateAndDefaults
          options={["hello"]}
          layoutRenderer={layoutRenderer}
        />,
      );
    });
    it("should be called with isFiltered=true when filtered", () => {
      let call = layoutRenderer.mock.calls.pop();
      expect(call[0].isFiltered).toEqual(false);
      expect(call[0].isAllSelected).toEqual(false);
      focus();
      type("blah");
      call = layoutRenderer.mock.calls.pop();
      expect(call[0].optionList).toEqual(undefined);
      expect(call[0].isFiltered).toEqual(true);
      expect(call[0].isAllSelected).toEqual(false);
    });
    it("should be called with isAllSelected=true when all options are selected", () => {
      let call = layoutRenderer.mock.calls.pop();
      expect(call[0].isFiltered).toEqual(false);
      expect(call[0].isAllSelected).toEqual(false);
      focus();
      keyDown(KEYCODE_ENTER);
      call = layoutRenderer.mock.calls.pop();
      expect(call[0].optionList).toEqual(undefined);
      expect(call[0].isFiltered).toEqual(false);
      expect(call[0].isAllSelected).toEqual(true);
    });
  });
});
