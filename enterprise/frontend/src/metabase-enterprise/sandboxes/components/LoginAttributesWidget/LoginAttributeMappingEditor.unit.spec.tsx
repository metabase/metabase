import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  StructuredUserAttributes,
  UserAttributeMap,
} from "metabase-types/api";

import { LoginAttributeMappingEditor } from "./LoginAttributeMappingEditor";

const simpleAttributes: UserAttributeMap = {
  type: "insect",
  color: "green",
  personal: "secret",
};

const structuredAttributes: StructuredUserAttributes = {
  type: {
    // overridden tenant attribute
    source: "user",
    frozen: false,
    value: "insect",
    original: {
      source: "tenant",
      frozen: false,
      value: "bug",
    },
  },
  color: {
    // inherited tenant attribute
    source: "tenant",
    frozen: false,
    value: "green",
  },
  personal: {
    // personal attribute
    source: "user",
    frozen: false,
    value: "secret",
  },
  "@tenant.slug": {
    // immutable tenant slug
    source: "system",
    frozen: true,
    value: "bug_gym",
  },
};

const setup = ({
  simpleAttributes,
  structuredAttributes,
}: {
  simpleAttributes?: UserAttributeMap;
  structuredAttributes?: StructuredUserAttributes;
} = {}) => {
  const onChange = jest.fn();
  const onError = jest.fn();

  renderWithProviders(
    <LoginAttributeMappingEditor
      simpleAttributes={simpleAttributes ?? {}}
      structuredAttributes={structuredAttributes}
      onChange={onChange}
      onError={onError}
    />,
  );

  return { onChange, onError };
};

const changeInput = async (fromValue: string, toValue: string) => {
  const input = await screen.findByDisplayValue(fromValue);
  await userEvent.clear(input);
  await userEvent.type(input, toValue);
};

describe("LoginAttributeMappingEditor", () => {
  describe("simple attributes", () => {
    it("can load simple attributes", async () => {
      setup({ simpleAttributes });
      expect(await screen.findByDisplayValue("type")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("insect")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("color")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("green")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("personal")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("secret")).toBeInTheDocument();
    });

    it("can change an existing attribute key", async () => {
      const { onChange } = setup({ simpleAttributes });
      await changeInput("type", "animal");

      expect(onChange).toHaveBeenCalledWith({
        animal: "insect",
        color: "green",
        personal: "secret",
      });
    });

    it("can change an existing attribute value", async () => {
      const { onChange } = setup({ simpleAttributes });
      await changeInput("green", "purple");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "insect",
        color: "purple",
        personal: "secret",
      });
    });

    it("can change multiple keys and values at once", async () => {
      const { onChange } = setup({ simpleAttributes });

      await changeInput("green", "purple");
      await changeInput("color", "colour");
      await changeInput("secret", "info");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "insect",
        colour: "purple",
        personal: "info",
      });
    });

    it("can add a new attribute", async () => {
      const { onChange } = setup({ simpleAttributes });

      const addButton = await screen.findByRole("button", {
        name: /Add an attribute/,
      });
      await userEvent.click(addButton);

      const [keyInput, valueInput] = (
        await screen.findAllByRole("textbox")
      ).slice(-2);
      await userEvent.type(keyInput, "newAttribute");
      await userEvent.type(valueInput, "newValue");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "insect",
        color: "green",
        personal: "secret",
        newAttribute: "newValue",
      });
    });

    it("can remove an attribute", async () => {
      const { onChange } = setup({ simpleAttributes });

      const lastX = (await screen.findAllByLabelText("close icon")).slice(
        -1,
      )[0];
      await userEvent.click(lastX);

      expect(onChange).toHaveBeenCalledWith({
        type: "insect",
        color: "green",
      });
    });

    it("can remove all attributes", async () => {
      const { onChange } = setup({ simpleAttributes });

      do {
        const exes = await screen.findAllByLabelText("close icon");
        await userEvent.click(exes[0]);
      } while (screen.queryAllByLabelText("close icon")?.length > 0);

      expect(onChange).toHaveBeenLastCalledWith({});
    });
  });

  describe("structured attributes", () => {
    it("shows system defined attributes as read only", async () => {
      setup({ structuredAttributes });

      expect(await screen.findByText("@tenant.slug")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("bug_gym")).toBeInTheDocument();
    });

    it("shows tenant attributes with text keys", async () => {
      setup({ structuredAttributes });

      expect(await screen.findByText("type")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("insect")).toBeInTheDocument();
      expect(await screen.findByText("color")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("green")).toBeInTheDocument();
    });

    it("shows user defined attributes with editable keys and values", async () => {
      setup({ structuredAttributes });

      expect(await screen.findByDisplayValue("personal")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("secret")).toBeInTheDocument();
    });

    it("can add a new attribute", async () => {
      const { onChange } = setup({ structuredAttributes });

      const addButton = await screen.findByRole("button", {
        name: /Add an attribute/,
      });
      await userEvent.click(addButton);

      const [keyInput, valueInput] = (
        await screen.findAllByRole("textbox")
      ).slice(-2);
      await userEvent.type(keyInput, "newAttribute");
      await userEvent.type(valueInput, "newValue");

      expect(onChange).toHaveBeenLastCalledWith({
        "@tenant.slug": "bug_gym",
        type: "insect",
        color: "green",
        personal: "secret",
        newAttribute: "newValue",
      });
    });

    it("can update user attribute keys and values", async () => {
      const { onChange } = setup({ structuredAttributes });

      await changeInput("personal", "public");
      await changeInput("secret", "newSecret");

      expect(onChange).toHaveBeenLastCalledWith({
        "@tenant.slug": "bug_gym",
        type: "insect",
        color: "green",
        public: "newSecret",
      });
    });

    it("can remove a user attribute", async () => {
      const { onChange } = setup({ structuredAttributes });

      const x = await screen.findByLabelText("close icon");
      await userEvent.click(x);

      expect(onChange).toHaveBeenCalledWith({
        "@tenant.slug": "bug_gym",
        type: "insect",
        color: "green",
      });
    });

    it("can override a tenant attribute value", async () => {
      const { onChange } = setup({ structuredAttributes });

      await changeInput("green", "blue");
      expect(onChange).toHaveBeenLastCalledWith({
        "@tenant.slug": "bug_gym",
        type: "insect",
        color: "blue",
        personal: "secret",
      });
    });

    it("can change an overridden tenant attribute value", async () => {
      const { onChange } = setup({ structuredAttributes });

      await changeInput("insect", "ick");
      expect(onChange).toHaveBeenLastCalledWith({
        "@tenant.slug": "bug_gym",
        type: "ick",
        color: "green",
        personal: "secret",
      });
    });

    it("can revert a tenant attribute value", async () => {
      const { onChange } = setup({ structuredAttributes });

      expect(await screen.findByDisplayValue("insect")).toBeInTheDocument();
      const revertButton = await screen.findByLabelText("refresh icon");
      await userEvent.click(revertButton);

      expect(await screen.findByDisplayValue("bug")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("insect")).not.toBeInTheDocument();

      expect(onChange).toHaveBeenLastCalledWith({
        "@tenant.slug": "bug_gym",
        type: "bug",
        color: "green",
        personal: "secret",
      });
    });
  });

  it("can handle not having any attributes", async () => {
    setup();

    expect(await screen.findByTestId("mapping-editor")).toBeInTheDocument();
  });
});
