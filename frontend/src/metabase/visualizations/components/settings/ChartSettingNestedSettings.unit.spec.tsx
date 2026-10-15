import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { chartSettingNestedSettings } from "./ChartSettingNestedSettings";

type TestObject = { name: string };

const getObjectKey = (object: TestObject) =>
  JSON.stringify(["name", object.name]);

const getObjectSettings = (
  settings: Record<string, unknown> | undefined,
  object: TestObject,
) => settings?.[getObjectKey(object)];

const ComposedComponent = ({ object, onChangeObjectSettings }: any) => (
  <button
    onClick={() =>
      onChangeObjectSettings(object, { column_title: "New title" })
    }
  >
    change
  </button>
);

const WrappedComponent = chartSettingNestedSettings(ComposedComponent);

describe("chartSettingNestedSettings", () => {
  it("does not write undefined entries for objects without stored settings (EMB-1940)", async () => {
    const onChange = jest.fn();
    const objects: TestObject[] = [{ name: "A" }, { name: "B" }];

    render(
      <WrappedComponent
        series={[]}
        objects={objects}
        getObjectKey={getObjectKey}
        getObjectSettings={getObjectSettings}
        getSettingDefinitionsForObject={() => ({})}
        getComputedSettingsForObject={() => ({})}
        // only object B has stored settings
        value={{ '["name","B"]': { column_title: "Old title" } }}
        initialKey={getObjectKey(objects[1])}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "change" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newSettings = onChange.mock.calls[0][0];

    // object A (no stored settings) must not appear as an undefined entry
    expect(newSettings).not.toHaveProperty('["name","A"]');
    expect(Object.values(newSettings)).not.toContain(undefined);
    expect(newSettings).toEqual({
      '["name","B"]': { column_title: "New title" },
    });
  });
});
