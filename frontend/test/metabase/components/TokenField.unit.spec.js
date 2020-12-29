/* eslint-disable react/display-name */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  const input = () => {
    return screen.getByRole("textbox");
  };
  const value = () => component.state().value;
  const values = () => {
    return screen.getAllByRole("list")[0];
  };
  const options = () => {
    return screen.getAllByRole("list")[1];
  };
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
    render(<TokenFieldWithStateAndDefaults />);
    expect(screen.queryByText("foo")).toBeNull();
    expect(screen.queryByText("bar")).toBeNull();
  });

  it("should render with 1 options and 1 values", () => {
    render(
      <TokenFieldWithStateAndDefaults value={["foo"]} options={["bar"]} />,
    );
    within(values()).getByText("foo");
    within(options()).getByText("bar");
  });

  it("shouldn't show previous used option by default", () => {
    render(
      <TokenFieldWithStateAndDefaults value={["foo"]} options={["foo"]} />,
    );
    // options() returns `undefined`
    expect(options()).toBeFalsy();
  });

  it("should show previous used option if removeSelected={false} is provided", () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["foo"]}
        removeSelected={false}
      />,
    );
    within(options()).getByText("foo");
  });

  it("should filter correctly", () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["bar", "baz"]}
      />,
    );
    fireEvent.change(input(), { target: { value: "nope" } });
    expect(options()).toBeFalsy();
    fireEvent.change(input(), { target: { value: "bar" } });
    within(options()).getByText("bar");
  });

  it("should add freeform value if parseFreeformValue is provided", () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={[]}
        options={["bar", "baz"]}
        parseFreeformValue={value => value}
      />,
    );
    userEvent.type(input(), "yep");
    expect(input().value).toEqual("");

    fireEvent.change(input(), { target: { value: "yep" } });
    expect(input().value).toEqual("yep");
  });

  it("should add option when clicked and hide it afterwards", () => {
    render(
      <TokenFieldWithStateAndDefaults value={[]} options={["bar", "baz"]} />,
    );
    within(options()).getByText("bar");
    within(options()).getByText("baz");

    fireEvent.click(screen.getByText("bar"));
    within(values()).getByText("bar");
    expect(within(options()).queryByText("bar")).toBeNull();
  });

  it("should add option when filtered and clicked", () => {
    render(
      <TokenFieldWithStateAndDefaults value={[]} options={["foo", "bar"]} />,
    );
    fireEvent.change(input(), { target: { value: "ba" } });
    fireEvent.click(screen.getByText("bar"));
    within(values()).getByText("bar");
  });

  // Not clear? and not possible to simulate with RTL
  xit("should type a character that's on the comma key", () => {
    render(<TokenFieldWithStateAndDefaults value={[]} options={["fooбar"]} />);

    fireEvent.change(input(), { target: { value: "foo" } });
    screen.debug();

    input().focus();
    fireEvent.keyDown(input(), {
      key: "б",
      keyCode: 188,
    });
    screen.debug(input());
    // 188 is comma on most layouts
    // input().simulate("keydown", { keyCode: 188, key: "б" });
    // if that keydown was interpreted as a comma, the value would be "fooбar"
    // expect(input().props().value).toEqual("foo");
  });

  describe("when updateOnInputChange is provided", () => {
    beforeEach(() => {
      render(
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
      fireEvent.change(input(), { target: { value: "yep" } });
      within(values()).getByText("yep");
    });

    it("should only add one option when filtered and clicked", () => {
      fireEvent.change(input(), { target: { value: "Do" } });
      within(values()).getByText("Do");

      fireEvent.click(screen.getByText("Doohickey"));
      within(values()).getByText("Doohickey");
      expect(input().value).toEqual("");
    });

    it("should only add one option when filtered and enter is pressed", () => {
      fireEvent.change(input(), { target: { value: "Do" } });
      within(values()).getByText("Do");

      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(values()).getByText("Doohickey");
      expect(input().value).toEqual("");

      within(options()).getByText("Gadget");
      within(options()).getByText("Gizmo");
      within(options()).getByText("Widget");
    });

    it("shouldn't hide option matching input freeform value", () => {
      fireEvent.change(input(), { target: { value: "Doohickey" } });
      within(values()).getByText("Doohickey");
      within(options()).getByText("Doohickey");
    });

    // This is messy and tricky to test with RTL
    it("should not commit empty freeform value", () => {
      fireEvent.change(input(), { target: { value: "Doohickey" } });
      userEvent.clear(input());
      fireEvent.change(input(), { target: { value: "" } });
      input().blur();
      expect(values().textContent).toBe("");
      expect(input().value).toEqual("");
    });

    it("should hide the input but not clear the search after accepting an option", () => {
      fireEvent.change(input(), { target: { value: "G" } });
      within(options()).getByText("Gadget");
      within(options()).getByText("Gizmo");

      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(options()).getByText("Gizmo");
      expect(within(options()).queryByText("Doohickey")).toBeNull();
      expect(within(options()).queryByText("Widget")).toBeNull();
      expect(input().value).toEqual("");

      // Reset search on focus (it was a separate test before)
      input().focus();
      within(options()).getByText("Doohickey");
      within(options()).getByText("Widget");
    });

    it("should reset the search when adding the last option", () => {
      fireEvent.change(input(), { target: { value: "G" } });
      within(options()).getByText("Gadget");
      within(options()).getByText("Gizmo");

      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(options()).getByText("Gizmo");

      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(options()).getByText("Doohickey");
      within(options()).getByText("Widget");
    });

    it("should hide the option if typed exactly then press enter", () => {
      fireEvent.change(input(), { target: { value: "Gadget" } });
      within(options()).getByText("Gadget");
      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(values()).getByText("Gadget");

      within(options()).getByText("Doohickey");
      within(options()).getByText("Gizmo");
      within(options()).getByText("Widget");
    });

    it("should hide the option if typed partially then press enter", () => {
      fireEvent.change(input(), { target: { value: "Gad" } });
      within(options()).getByText("Gadget");
      fireEvent.keyDown(input(), { keyCode: KEYCODE_ENTER });
      within(values()).getByText("Gadget");
      within(options()).getByText("Doohickey");
      within(options()).getByText("Gizmo");
      within(options()).getByText("Widget");
    });

    it("should hide the option if typed exactly then clicked", () => {
      fireEvent.change(input(), { target: { value: "Gadget" } });
      fireEvent.click(within(options()).getByText("Gadget"));

      within(values()).getByText("Gadget");
      within(options()).getByText("Doohickey");
      within(options()).getByText("Gizmo");
      within(options()).getByText("Widget");
    });

    it("should hide the option if typed partially then clicked", () => {
      fireEvent.change(input(), { target: { value: "Gad" } });
      fireEvent.click(within(options()).getByText("Gadget"));
      within(values()).getByText("Gadget");
      within(options()).getByText("Doohickey");
      within(options()).getByText("Gizmo");
      within(options()).getByText("Widget");
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
