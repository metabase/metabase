/* eslint-disable jest/expect-expect */
/* eslint-disable react/prop-types */

import { act, render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component } from "react";

import { KEYCODE_ENTER } from "metabase/lib/keyboard";

import TokenField from "./TokenField";

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

class TokenFieldWithStateAndDefaults extends Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value || [],
    };
  }
  render() {
    // allow overriding everything except value and onChange which we provide
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
  beforeAll(() => {
    // temporarily until JSDOM updates
    // eslint-disable-next-line testing-library/no-node-access
    if (!global.Element.prototype.closest) {
      // eslint-disable-next-line testing-library/no-node-access
      global.Element.prototype.closest = function (selector) {
        let element = this;
        while (element) {
          if (element.matches(selector)) {
            return element;
          }
          // eslint-disable-next-line testing-library/no-node-access
          element = element.parentElement;
        }
      };
    }
  });

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
    expect(values()).toHaveTextContent(collection.join(""));

  const findWithinOptions = collection =>
    expect(options()).toHaveTextContent(collection.join(""));

  it("should render with no options or values", () => {
    render(<TokenFieldWithStateAndDefaults />);
    expect(screen.queryByText("foo")).not.toBeInTheDocument();
    expect(screen.queryByText("bar")).not.toBeInTheDocument();
  });

  it("should render input prefix with prefix prop", () => {
    render(<TokenFieldWithStateAndDefaults prefix="$$$" />);
    expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
  });

  it("should not render input prefix without prefix prop", () => {
    render(<TokenFieldWithStateAndDefaults />);
    expect(screen.queryByTestId("input-prefix")).not.toBeInTheDocument();
  });

  it("should render with 1 options and 1 values", () => {
    render(
      <TokenFieldWithStateAndDefaults
        multi
        value={["foo"]}
        options={["bar"]}
      />,
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

  it("should not allow adding new items when canAddItems is false", () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={["foo"]}
        options={["bar", "baz"]}
        canAddItems={false}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should add freeform value if parseFreeformValue is provided", async () => {
    render(
      <TokenFieldWithStateAndDefaults
        value={[]}
        options={["bar", "baz"]}
        parseFreeformValue={value => value}
      />,
    );
    await userEvent.type(input(), "yep");
    expect(input().value).toEqual("yep");

    type("yep");
    expect(input().value).toEqual("yep");
  });

  it("should add clicked option to values and hide it in options list", () => {
    render(
      <TokenFieldWithStateAndDefaults
        multi
        value={[]}
        options={["bar", "baz"]}
      />,
    );
    findWithinOptions(["bar", "baz"]);

    clickText("bar");
    findWithinValues(["bar"]);
    findWithinOptions(["baz"]);
  });

  it("should add option when filtered and clicked", () => {
    render(
      <TokenFieldWithStateAndDefaults
        multi
        value={[]}
        options={["foo", "bar"]}
      />,
    );
    type("ba");
    clickText("bar");
    findWithinValues(["bar"]);
  });

  describe("when updateOnInputChange is provided", () => {
    function setup() {
      render(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputChange
        />,
      );
    }

    it("should add freeform value immediately if updateOnInputChange is provided", () => {
      setup();
      type("yep");
      findWithinValues(["yep"]);
    });

    it("should only add one option when filtered and clicked", () => {
      setup();

      type("Do");
      findWithinValues(["Do"]);

      clickText("Doohickey");
      findWithinValues(["Doohickey"]);
      expect(input().value).toEqual("");
    });

    it("should only add one option when filtered and enter is pressed", () => {
      setup();

      type("Do");
      findWithinValues(["Do"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Doohickey"]);
      expect(input().value).toEqual("");
      findWithinOptions(["Gadget", "Gizmo", "Widget"]);
    });

    it("shouldn't hide option matching input freeform value", () => {
      setup();

      type("Doohickey");
      findWithinValues(["Doohickey"]);
      findWithinOptions(["Doohickey"]);
    });

    // This is messy and tricky to test with RTL
    it("should not commit empty freeform value", async () => {
      setup();

      type("Doohickey");
      await userEvent.clear(input());
      type("");
      input().blur();
      expect(values()).toHaveTextContent("");
      expect(input().value).toEqual("");
    });

    it("should hide the input but not clear the search after accepting an option", () => {
      setup();

      type("G");
      findWithinOptions(["Gadget", "Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Gizmo"]);
      expect(input().value).toEqual("");

      // Reset search on focus (it was a separate test before)
      act(() => {
        input().focus();
      });
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should reset the search when adding the last option", () => {
      setup();

      type("G");
      findWithinOptions(["Gadget", "Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Gizmo"]);

      inputKeydown(KEYCODE_ENTER);
      findWithinOptions(["Doohickey", "Widget"]);
    });

    it("should hide the option if typed exactly then press enter", () => {
      setup();

      type("Gadget");
      findWithinOptions(["Gadget"]);
      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then press enter", () => {
      setup();

      type("Gad");
      findWithinOptions(["Gadget"]);
      inputKeydown(KEYCODE_ENTER);
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed exactly then clicked", () => {
      setup();

      type("Gadget");
      fireEvent.click(within(options()).getByText("Gadget"));
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });

    it("should hide the option if typed partially then clicked", () => {
      setup();

      type("Gad");
      fireEvent.click(within(options()).getByText("Gadget"));
      findWithinValues(["Gadget"]);
      findWithinOptions(["Doohickey", "Gizmo", "Widget"]);
    });
  });

  describe("when updateOnInputBlur is false", () => {
    function setup() {
      render(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputBlur={false}
        />,
      );
    }

    it("should not add freeform value immediately", () => {
      setup();
      type("yep");
      expect(values()).toHaveTextContent("");
    });

    it("should not add freeform value when blurring", () => {
      setup();
      type("yep");
      fireEvent.blur(input());
      expect(values()).toHaveTextContent("");
    });
  });

  describe("when updateOnInputBlur is true", () => {
    function setup() {
      render(
        <TokenFieldWithStateAndDefaults
          options={DEFAULT_OPTIONS}
          multi
          // return null for empty string since it's not a valid
          parseFreeformValue={value => value || null}
          updateOnInputBlur={true}
        />,
      );
    }

    it("should not add freeform value immediately", () => {
      setup();
      type("yep");
      expect(values()).toHaveTextContent("");
    });

    it("should add freeform value when blurring", () => {
      setup();
      type("yep");
      fireEvent.blur(input());
      findWithinValues(["yep"]);
    });
  });

  describe("with multi=true", () => {
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
    it("should not prevent blurring on tab", async () => {
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
      await userEvent.tab();
      expect(input()).not.toHaveFocus();
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

      expect(input().value).toBe(DATA);
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
    });

    it("should be called with isFiltered=true when filtered", () => {
      render(
        <TokenFieldWithStateAndDefaults
          options={["hello"]}
          layoutRenderer={layoutRenderer}
        />,
      );

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
      render(
        <TokenFieldWithStateAndDefaults
          options={["hello"]}
          layoutRenderer={layoutRenderer}
        />,
      );

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
