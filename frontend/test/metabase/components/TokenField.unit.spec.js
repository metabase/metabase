/* eslint-disable react/display-name */
/* eslint-disable react/prop-types */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TokenField from "metabase/components/TokenField";

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
  const input = () => {
    return screen.getByRole("textbox");
  };

  const values = () => {
    return screen.getAllByRole("list")[0];
  };

  const options = () => {
    return screen.getAllByRole("list")[1];
  };

  const type = str => fireEvent.change(input(), { target: { value: str } });

  const clickText = str => fireEvent.click(screen.getByText(str));

  const inputKeydown = keyCode =>
    fireEvent.keyDown(input(), { keyCode: keyCode });

  const findWithinValues = collection =>
    expect(values().textContent).toBe(collection.join(""));

  const findWithinOptions = collection =>
    expect(options().textContent).toBe(collection.join(""));

  it("should render with no options or values", () => {
    render(<TokenFieldWithStateAndDefaults />);
    expect(screen.queryByText("foo")).toBeNull();
    expect(screen.queryByText("bar")).toBeNull();
  });

  it("should render with 1 options and 1 values", () => {
    render(
      <TokenFieldWithStateAndDefaults value={["foo"]} options={["bar"]} />,
    );
    findWithinValues(["foo"]);
    findWithinOptions(["bar"]);
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
    findWithinOptions(["foo"]);
  });

  it("should filter correctly", () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["bar", "baz"]}
      />,
    );
    type("nope");
    expect(options()).toBeFalsy();
    type("bar");
    findWithinOptions(["bar"]);
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

    type("yep");
    expect(input().value).toEqual("yep");
  });

  it("should add clicked option to values and hide it in options list", () => {
    render(
      <TokenFieldWithStateAndDefaults value={[]} options={["bar", "baz"]} />,
    );
    findWithinOptions(["bar", "baz"]);

    clickText("bar");
    findWithinValues(["bar"]);
    findWithinOptions(["baz"]);
  });

  it("should add option when filtered and clicked", () => {
    render(
      <TokenFieldWithStateAndDefaults value={[]} options={["foo", "bar"]} />,
    );
    type("ba");
    clickText("bar");
    findWithinValues(["bar"]);
  });

  // Not clear? and not possible to simulate with RTL
  xit("should type a character that's on the comma key", () => {
    render(<TokenFieldWithStateAndDefaults value={[]} options={["fooбar"]} />);

    type("foo");
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
      type("yep");
      findWithinValues(["yep"]);
    });

    it("should only add one option when filtered and clicked", () => {
      type("Do");
      findWithinValues(["Do"]);

      clickText("Doohickey");
      findWithinValues(["Doohickey"]);
      expect(input().value).toEqual("");
    });

    it("should only add one option when filtered and enter is pressed", () => {
      type("Do");
      findWithinValues(["Do"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Doohickey"]);
      expect(input().value).toEqual("");
      findWithinOptions(["Gadget", "Gizmo", "Widget"]);
    });

    it("shouldn't hide option matching input freeform value", () => {
      type("Doohickey");
      findWithinValues(["Doohickey"]);
      findWithinOptions(["Doohickey"]);
    });

    // This is messy and tricky to test with RTL
    it("should not commit empty freeform value", () => {
      type("Doohickey");
      userEvent.clear(input());
      type("");
      input().blur();
      expect(values().textContent).toBe("");
      expect(input().value).toEqual("");
    });

    it("should hide the input but not clear the search after accepting an option", () => {
      type("G");
      findWithinOptions(["Gadget", "Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Gizmo"]);
      expect(input().value).toEqual("");

      // Reset search on focus (it was a separate test before)
      input().focus();
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should reset the search when adding the last option", () => {
      type("G");
      findWithinOptions(["Gadget", "Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Doohickey", "Widget"]);
    });

    it("should hide the option if typed exactly then press enter", () => {
      type("Gadget");
      findWithinOptions(["Gadget"]);
      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then press enter", () => {
      type("Gad");
      findWithinOptions(["Gadget"]);
      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed exactly then clicked", () => {
      type("Gadget");
      fireEvent.click(within(options()).getByText("Gadget"));
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then clicked", () => {
      type("Gad");
      fireEvent.click(within(options()).getByText("Gadget"));
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });
  });

  describe("when updateOnInputBlur is false", () => {
    beforeEach(() => {
      render(
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
      type("yep");
      expect(values().textContent).toBe("");
    });

    it("should not add freeform value when blurring", () => {
      type("yep");
      fireEvent.blur(input());
      expect(values().textContent).toBe("");
    });
  });

  describe("when updateOnInputBlur is true", () => {
    beforeEach(() => {
      render(
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
      type("yep");
      expect(values().textContent).toBe("");
    });

    it("should add freeform value when blurring", () => {
      type("yep");
      fireEvent.blur(input());
      findWithinValues(["yep"]);
    });
  });

  describe.skip("key selection", () => {
    [
      ["keyCode", KEYCODE_TAB],
      ["keyCode", KEYCODE_ENTER],
      ["key", KEY_COMMA],
    ].map(([keyType, keyValue]) =>
      it(`should allow the user to use arrow keys and then ${keyType}: ${keyValue} to select a recipient`, () => {
        const spy = jest.fn();

        render(
          <TokenField
            {...DEFAULT_TOKEN_FIELD_PROPS}
            options={DEFAULT_OPTIONS}
            onChange={spy}
          />,
        );

        // limit our options by typing
        type("G");
        screen.debug();

        // the initially selected option should be the first option
        // expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[1]);

        inputKeydown(KEYCODE_DOWN);
        screen.debug();

        // input().simulate("keydown", {
        //   keyCode: KEYCODE_DOWN,
        //   preventDefault: jest.fn(),
        // });

        // // the next possible option should be selected now
        // // expect(component.state().selectedOptionValue).toBe(DEFAULT_OPTIONS[2]);

        // input().simulate("keydown", {
        //   [keyType]: keyValue,
        //   preventDefalut: jest.fn(),
        // });

        // expect(spy).toHaveBeenCalledTimes(1);
        // expect(spy).toHaveBeenCalledWith([DEFAULT_OPTIONS[2]]);
      }),
    );
  });

  describe("with multi=true", () => {
    // Couldn't confirm that blur is prevented
    xit("should prevent blurring on tab", () => {
      render(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
          multi
        />,
      );
      type("asdf");
      input().focus();
      userEvent.tab();

      // Instead of relying on `preventDefault` like the previous version of the test did,
      // we're simply checking the values - onBlur would've set the value
      expect(values().textContent).toBe("");
    });

    it('should paste "1,2,3" as multiple values', () => {
      render(
        <TokenFieldWithStateAndDefaults
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
          multi
        />,
      );

      fireEvent.paste(input(), {
        clipboardData: {
          getData: () => "1,2,3",
        },
      });
      findWithinValues(["1", "2", "3"]);
      // prevent pasting into <input>
      expect(input().value).toBe("");
    });
  });

  describe("with multi=false", () => {
    it("should not prevent blurring on tab", () => {
      render(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
      type("asdf");
      input().focus();
      userEvent.tab();
      findWithinValues(["asdf"]);
    });

    it('should paste "1,2,3" as one value', () => {
      const DATA = "1,2,3";
      render(
        <TokenFieldWithStateAndDefaults
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
      fireEvent.paste(input(), {
        clipboardData: {
          getData: () => DATA,
        },
      });
      findWithinValues([DATA]);
      expect(input().value).toBe("");
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
      render(
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
      inputKeydown(KEYCODE_ENTER);
      call = layoutRenderer.mock.calls.pop();
      expect(call[0].optionList).toEqual(undefined);
      expect(call[0].isFiltered).toEqual(false);
      expect(call[0].isAllSelected).toEqual(true);
    });
  });
});
