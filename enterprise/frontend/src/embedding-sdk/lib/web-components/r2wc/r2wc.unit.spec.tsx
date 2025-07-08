import React, { type FC } from "react";

import { Slot } from "embedding-sdk/components/private/Slot";

import { r2wc } from "./r2wc";
import type { R2wcBaseProps } from "./r2wc-core";

function flushPromises() {
  // We properly deal with DOM updates and `Promise.resolve` in r2wcCore,
  return new Promise((resolve) =>
    setTimeout(() => {
      setTimeout(resolve);
    }),
  );
}

const Greeting: FC<{ name: string } & R2wcBaseProps> = ({ name }) => (
  <h1>Hello, {name}</h1>
);

describe("r2wc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("basics with react", () => {
    const MyWelcome = r2wc(Greeting);
    customElements.define("my-welcome", MyWelcome);

    const myWelcome = new MyWelcome();

    document.getElementsByTagName("body")[0].appendChild(myWelcome);

    expect(myWelcome.nodeName).toEqual("MY-WELCOME");
  });

  it("works with props array", async () => {
    function TestComponent({ name }: { name: string } & R2wcBaseProps) {
      return <div>hello, {name}</div>;
    }

    const TestElement = r2wc(TestComponent, { propTypes: ["name"] });

    customElements.define("test-hello", TestElement);

    const body = document.body;
    body.innerHTML = "<test-hello name='Bavin'></test-hello>";

    await flushPromises();

    const child = body.querySelector("test-hello");
    const div = child?.shadowRoot?.querySelector("div");

    expect(div?.textContent).toBe("hello, Bavin");
  });

  it("works with class components", async () => {
    class TestClassComponent extends React.Component<
      { name: string } & R2wcBaseProps
    > {
      render() {
        return <div>hello, {this.props.name}</div>;
      }
    }

    class TestClassElement extends r2wc(TestClassComponent, {
      propTypes: ["name"],
    }) {}

    customElements.define("test-class", TestClassElement);

    const body = document.body;
    body.innerHTML = "<test-class name='Bavin'></test-class>";

    await flushPromises();

    const child = body.querySelector("test-class");
    const div = child?.shadowRoot?.querySelector("div");
    const testClassEl = body.querySelector("test-class");

    expect(testClassEl).toBeInstanceOf(TestClassElement);
    expect(div?.textContent).toBe("hello, Bavin");
  });

  it("works with shadow DOM `options.shadow === 'open'`", async () => {
    const MyWelcome = r2wc(Greeting, {
      propTypes: {
        name: "string",
      },
    });

    customElements.define("my-shadow-welcome", MyWelcome);

    const body = document.body;
    body.innerHTML = "<my-shadow-welcome name='Bavin'></my-shadow-welcome>";

    await flushPromises();

    const webComponent = body.querySelector("my-shadow-welcome");
    const shadowRoot = webComponent?.shadowRoot;

    expect(shadowRoot).not.toEqual(undefined);
    expect(shadowRoot?.children.length).toEqual(1);

    const child = shadowRoot?.childNodes[0] as HTMLElement;

    expect(child.tagName).toEqual("H1");
    expect(child.innerHTML).toEqual("Hello, Bavin");

    webComponent?.setAttribute("name", "Justin");

    await flushPromises();

    expect(child.innerHTML).toBe("Hello, Justin");
  });

  it("converts dashed-attributes to camelCase", async () => {
    const CamelCaseGreeting = ({
      camelCaseName,
    }: {
      camelCaseName: string;
    } & R2wcBaseProps) => <h1>Hello, {camelCaseName}</h1>;

    const MyGreeting = r2wc(CamelCaseGreeting, {
      propTypes: ["camelCaseName"],
    });

    customElements.define("my-dashed-style-greeting", MyGreeting);

    const body = document.body;

    body.innerHTML =
      "<my-dashed-style-greeting camel-case-name='Christopher'></my-dashed-style-greeting>";

    await flushPromises();

    const child = body.querySelector("my-dashed-style-greeting");
    const shadowRoot = child?.shadowRoot;

    expect(shadowRoot?.innerHTML).toEqual("<h1>Hello, Christopher</h1>");
  });

  it("options.props can specify and will convert the String attribute value into Number, Boolean, Array, and/or Object", async () => {
    type CastinProps = {
      stringProp: string;
      numProp: number;
      floatProp: number;
      trueProp: boolean;
      falseProp: boolean;
      arrayProp: any[];
      objProp: object;
    };

    const global = window as any;

    function OptionsPropsTypeCasting({
      stringProp,
      numProp,
      floatProp,
      trueProp,
      falseProp,
      arrayProp,
      objProp,
    }: CastinProps & R2wcBaseProps) {
      global.castedValues = {
        stringProp,
        numProp,
        floatProp,
        trueProp,
        falseProp,
        arrayProp,
        objProp,
      };

      return <h1>{stringProp}</h1>;
    }

    const WebOptionsPropsTypeCasting = r2wc(OptionsPropsTypeCasting, {
      propTypes: {
        stringProp: "string",
        numProp: "number",
        floatProp: "number",
        trueProp: "boolean",
        falseProp: "boolean",
        arrayProp: "json",
        objProp: "json",
      },
    });

    customElements.define("attr-type-casting", WebOptionsPropsTypeCasting);

    const body = document.body;

    console.error = function (...messages) {
      // propTypes will throw if any of the types passed into the underlying react component are wrong or missing
      expect("propTypes should not have thrown").toEqual(messages.join(""));
    };

    body.innerHTML = `
      <attr-type-casting
        string-prop="iloveyou"
        num-prop="360"
        float-prop="0.5"
        true-prop="true"
        false-prop="false"
        array-prop='[true, 100.25, "👽", { "aliens": "welcome" }]'
        obj-prop='{ "very": "object", "such": "wow!" }'
      ></attr-type-casting>
    `;

    await flushPromises();
    const {
      stringProp,
      numProp,
      floatProp,
      trueProp,
      falseProp,
      arrayProp,
      objProp,
    } = global.castedValues;
    expect(stringProp).toEqual("iloveyou");
    expect(numProp).toEqual(360);
    expect(floatProp).toEqual(0.5);
    expect(trueProp).toEqual(true);
    expect(falseProp).toEqual(false);
    expect(arrayProp.length).toEqual(4);
    expect(arrayProp[0]).toEqual(true);
    expect(arrayProp[1]).toEqual(100.25);
    expect(arrayProp[2]).toEqual("👽");
    expect(arrayProp[3].aliens).toEqual("welcome");
    expect(objProp.very).toEqual("object");
    expect(objProp.such).toEqual("wow!");
  });

  it("Props typed as Function convert the string value of attribute into global fn calls", async () => {
    const global = window as any;

    function ThemeSelect({
      handleClick,
    }: {
      handleClick: (arg: string) => void;
    } & R2wcBaseProps) {
      return (
        <div>
          <button onClick={() => handleClick("V")}>V</button>
          <button onClick={() => handleClick("Johnny")}>Johnny</button>
          <button onClick={() => handleClick("Jane")}>Jane</button>
        </div>
      );
    }

    const WebThemeSelect = r2wc(ThemeSelect, {
      propTypes: {
        handleClick: "function",
      },
    });

    customElements.define("theme-select", WebThemeSelect);

    const body = document.body;

    await new Promise((r) => {
      const failUnlessCleared = setTimeout(() => {
        delete global.globalFn;
        expect("globalFn was not called to clear the failure timeout").toEqual(
          "not to fail because globalFn should have been called to clear the failure timeout",
        );
        r(true);
      }, 1000);

      global.globalFn = function (selected: string) {
        delete global.globalFn;
        clearTimeout(failUnlessCleared);
        expect(selected).toEqual("Jane");
        r(true);
      };

      body.innerHTML = "<theme-select handle-click='globalFn'></theme-select>";

      setTimeout(() => {
        const child = document.querySelector("theme-select");
        const button = child?.shadowRoot?.querySelector(
          "button:last-child",
        ) as HTMLButtonElement;

        button.click();
      }, 0);
    });
  });

  it("passes context properly to children components", async () => {
    interface ParentComponentProps {
      textProp: string;
      numProp: number;
      boolProp: boolean;
      arrProp: string[];
      objProp: { [key: string]: string };
      funcProp: () => void;
    }
    interface ParentComponentContextProps extends ParentComponentProps {
      textProperty: string;
      numProperty: number;
      boolProperty: boolean;
      arrProperty: string[];
      objProperty: { [key: string]: string };
      funcProperty: () => void;
    }

    interface ChildComponentProps
      extends ParentComponentProps,
        ParentComponentContextProps {}

    const ParentElement = r2wc<
      R2wcBaseProps & ParentComponentProps,
      ParentComponentContextProps,
      ParentComponentContextProps
    >(
      ({ container, slot }) => {
        return <Slot container={container} slot={slot} />;
      },
      {
        propTypes: {
          textProp: "string",
          numProp: "number",
          boolProp: "boolean",
          arrProp: "json",
          objProp: "json",
          funcProp: "function",
        },
        contextPropTypes: {
          textProp: "string",
          numProp: "number",
          boolProp: "boolean",
          arrProp: "json",
          objProp: "json",
          funcProp: "function",
          textProperty: "string",
          numProperty: "number",
          boolProperty: "boolean",
          arrProperty: "json",
          objProperty: "json",
          funcProperty: "function",
        },
        defineContext: {
          childrenComponents: ["child-element"],
          provider: (instance, props: ParentComponentProps) => {
            return {
              textProp: props.textProp,
              numProp: props.numProp,
              boolProp: props.boolProp,
              arrProp: props.arrProp,
              objProp: props.objProp,
              funcProp: props.funcProp,
              textProperty: instance.textProperty,
              numProperty: instance.numProperty,
              boolProperty: instance.boolProperty,
              arrProperty: instance.arrProperty,
              objProperty: instance.objProperty,
              funcProperty: instance.funcProperty,
            };
          },
        },
      },
    );
    const ChildElement = r2wc<R2wcBaseProps & ChildComponentProps>(
      ({ textProp }) => {
        return <div>{textProp}</div>;
      },
    );

    (global as any).globalFn = function globalFn() {};
    (global as any).newFunc = function newFunc() {};

    customElements.define("parent-element", ParentElement);
    customElements.define("child-element", ChildElement);

    const body = document.body;
    body.innerHTML = `
      <parent-element
        text-prop='hello'
        obj-prop='{"greeting": "hello, world"}'
        arr-prop='["hello", "world"]'
        num-prop='240'
        bool-prop='true'
        func-prop='globalFn'
      >
        <child-element></child-element>
      </test-button-element-property>
    `;

    await flushPromises();

    const parentElement = body.querySelector("parent-element") as HTMLElement &
      ParentComponentContextProps;
    const childElement = body.querySelector("child-element") as HTMLElement;

    await flushPromises();

    parentElement.textProperty = "world";
    parentElement.numProperty = 100;
    parentElement.boolProperty = false;
    parentElement.arrProperty = ["foo", "bar"];
    parentElement.objProperty = { foo: "bar" };
    parentElement.funcProperty = (global as any).newFunc;

    await flushPromises();

    expect(childElement).toHaveAttribute("text-prop", "hello");
    expect(childElement).toHaveAttribute("num-prop", "240");
    expect(childElement).toHaveAttribute("bool-prop", "true");
    expect(childElement).toHaveAttribute("arr-prop", '["hello","world"]');
    expect(childElement).toHaveAttribute(
      "obj-prop",
      '{"greeting":"hello, world"}',
    );
    expect(childElement).toHaveAttribute(
      "func-prop",
      expect.stringMatching(/^fn-globalFn-.*/),
    );

    expect(childElement).toHaveAttribute("text-property", "world");
    expect(childElement).toHaveAttribute("num-property", "100");
    expect(childElement).toHaveAttribute("bool-property", "false");
    expect(childElement).toHaveAttribute("arr-property", '["foo","bar"]');
    expect(childElement).toHaveAttribute("obj-property", '{"foo":"bar"}');
    expect(childElement).toHaveAttribute(
      "func-property",
      expect.stringMatching(/^fn-newFunc-.*/),
    );
  });
});
