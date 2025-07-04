import type { FC } from "react";

import { type R2wcRenderContext, r2wcCore } from "./r2wc-core";

const mount = jest.fn(
  () => ({ why: "context" }) as unknown as R2wcRenderContext<unknown>,
);
const unmount = jest.fn();
const update = jest.fn();

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve));
}

describe("r2wc-core", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts and unmounts in open shadow mode", async () => {
    const ReactComponent: FC = () => <h1>Hello</h1>;

    const WebComponent = r2wcCore(
      ReactComponent,
      {},
      { mount, unmount, update },
    );
    customElements.define("test-shadow-open", WebComponent);

    const element = new WebComponent();

    document.body.appendChild(element);

    await flushPromises();

    expect(element).toHaveProperty("shadowRoot");
    expect(mount).toHaveBeenCalledTimes(1);

    document.body.removeChild(element);

    await flushPromises();

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledWith({ why: "context" });
  });

  it("updated attribute updates the component prop and the HTMLElement property", async () => {
    interface TestProps {
      text: string;
    }

    const Test: FC<TestProps> = ({ text }: { text: string }) => {
      return <button>{text}</button>;
    };

    const TestElement = r2wcCore(
      Test,
      { props: ["text"] },
      { mount, unmount, update },
    );

    customElements.define("test-button-element-attribute", TestElement);

    const body = document.body;
    body.innerHTML =
      "<test-button-element-attribute text='hello'></test-button-element-attribute>";

    const element = body.querySelector(
      "test-button-element-attribute",
    ) as HTMLElement & { text: string };

    element.setAttribute("text", "world");

    await flushPromises();

    expect(element.text).toBe("world");
  });

  it("updated HTMLElement property updates the component prop and the HTMLElement attribute", async () => {
    interface TestProps {
      text: string;
      numProp: number;
      boolProp: boolean;
      arrProp: string[];
      objProp: { [key: string]: string };
      funcProp: () => void;
    }

    const Test: FC<TestProps> = ({ text }: { text: string }) => {
      return <button>{text}</button>;
    };

    const TestElement = r2wcCore(
      Test,
      {
        props: {
          text: "string",
          numProp: "number",
          boolProp: "boolean",
          arrProp: "json",
          objProp: "json",
          funcProp: "function",
        },
      },
      { mount, unmount, update },
    );

    (global as any).globalFn = function () {
      expect(true).toBe(true);
      return true;
    };

    (global as any).newFunc = function newFunc() {
      expect(this).toBe(document.querySelector("test-button-element-property"));
    };

    customElements.define("test-button-element-property", TestElement);

    const body = document.body;
    body.innerHTML = `<test-button-element-property text='hello' obj-prop='{"greeting": "hello, world"}' arr-prop='["hello", "world"]' num-prop='240' bool-prop='true' func-prop='globalFn'>
                      </test-button-element-property>`;

    const element = body.querySelector(
      "test-button-element-property",
    ) as HTMLElement & TestProps;

    await flushPromises();

    expect(element.text).toBe("hello");
    expect(element.numProp).toBe(240);
    expect(element.boolProp).toBe(true);
    expect(element.arrProp).toEqual(["hello", "world"]);
    expect(element.objProp).toEqual({ greeting: "hello, world" });
    expect(element.funcProp).toBeInstanceOf(Function);
    expect(element.funcProp()).toBe(true);

    element.text = "world";
    element.numProp = 100;
    element.boolProp = false;
    element.funcProp = (global as any).newFunc;

    await flushPromises();

    expect(element).toHaveAttribute("text", "world");
    expect(element).toHaveAttribute("num-prop", "100");
    expect(element).toHaveAttribute("bool-prop", "false");
    expect(element).toHaveAttribute(
      "func-prop",
      expect.stringMatching(/^fn-newFunc-.*/),
    );
  });

  test("sets HTML property not defined in props but found on HTML object", async () => {
    interface TestProps {
      text: string;
    }

    const Test: FC<TestProps> = ({
      text = "Hello, button",
    }: {
      text: string;
    }) => {
      return <button>{text}</button>;
    };

    const TestElement = r2wcCore(
      Test,
      { props: ["text"] },
      { mount, unmount, update },
    );

    customElements.define("test-button-element-non-prop", TestElement);

    const body = document.body;
    body.innerHTML = `<test-button-element-non-prop></test-button-element-non-prop>`;

    const element = body.querySelector(
      "test-button-element-non-prop",
    ) as HTMLElement & { text: string };
    element.style.backgroundColor = "red";
    element.style.visibility = "hidden";
    element.id = "test-button-id";

    await flushPromises();

    expect(element).toHaveStyle("background-color: rgb(255, 0, 0);");
    expect(element).not.toBeVisible();
    expect(body.querySelector("#test-button-id")).toBe(element);
  });
});
