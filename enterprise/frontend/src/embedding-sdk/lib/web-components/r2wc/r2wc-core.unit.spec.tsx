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
      { propTypes: ["text"] },
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
