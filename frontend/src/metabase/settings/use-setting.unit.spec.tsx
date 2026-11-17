import { renderWithProviders, screen } from "__support__/ui";
import type { Settings } from "metabase-types/api";

import { useSetting } from "./use-setting";

const TestComponent = ({ settingName }: { settingName: keyof Settings }) => {
  const settingValue = useSetting(settingName);

  return (
    <div>
      <div>{JSON.stringify(settingValue)}</div>
      <div>{typeof settingValue}</div>
      <div>{Array.isArray(settingValue) && "isArray"}</div>
      <div>{settingValue === null && "isNull"}</div>
    </div>
  );
};

describe("useSetting", () => {
  it("should get a string setting", async () => {
    renderWithProviders(<TestComponent settingName={"admin-email"} />);
    expect(screen.getByText('"admin@metabase.test"')).toBeInTheDocument();
    expect(screen.getByText("string")).toBeInTheDocument();
  });

  it("should get a number setting", async () => {
    renderWithProviders(
      <TestComponent settingName={"query-caching-min-ttl"} />,
    );
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
  });

  it("should get a boolean setting", async () => {
    renderWithProviders(<TestComponent settingName={"ldap-enabled"} />);
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("boolean")).toBeInTheDocument();
  });

  it("should get an object setting", async () => {
    renderWithProviders(<TestComponent settingName={"password-complexity"} />);
    expect(screen.getByText('{"total":6,"digit":1}')).toBeInTheDocument();
    expect(screen.getByText("object")).toBeInTheDocument();
  });

  it("should get an array setting", async () => {
    renderWithProviders(<TestComponent settingName={"available-fonts"} />);
    expect(screen.getByText("[]")).toBeInTheDocument();
    expect(screen.getByText("object")).toBeInTheDocument();
    expect(screen.getByText("isArray")).toBeInTheDocument();
  });

  it("should get an empty setting", async () => {
    renderWithProviders(<TestComponent settingName={"email-smtp-host"} />);
    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.getByText("object")).toBeInTheDocument();
    expect(screen.getByText("isNull")).toBeInTheDocument();
  });

  it("typescript should detect fake settings", async () => {
    // @ts-expect-error - testing expected error for bad keys
    renderWithProviders(<TestComponent settingName={"my-fake-setting"} />);
    expect(screen.getByText("undefined")).toBeInTheDocument();
  });
});
