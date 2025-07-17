import { userEvent } from "@testing-library/user-event";

import { setupUserEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import type {
  StructuredUserAttributes,
  UserAttributeMap,
} from "metabase-types/api";
import { createMockUserListResult } from "metabase-types/api/mocks";

import { LoginAttributesWidget } from "./LoginAttributesWidget";

const changeInput = async (fromValue: string, toValue: string) => {
  const input = await screen.findByDisplayValue(fromValue);
  await userEvent.clear(input);
  await userEvent.type(input, toValue);
};

const simpleAttributes: UserAttributeMap = {
  "@tenant.slug": "bug_gym",
  color: "green",
  type: "insect",
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

const setup = () => {
  const onChange = jest.fn();
  const onSubmit = jest.fn();
  const onError = jest.fn();

  setupUserEndpoints(
    createMockUserListResult({
      structured_attributes: structuredAttributes,
    }),
  );

  renderWithProviders(
    <FormProvider
      initialValues={{ login_attributes: simpleAttributes }}
      onSubmit={onSubmit}
    >
      <Form>
        <LoginAttributesWidget name="login_attributes" userId={1} />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onChange, onSubmit, onError };
};

describe("LoginAttributesWidget", () => {
  it("should not save system attributes", async () => {
    const { onSubmit } = setup();
    await screen.findByText("Attributes");
    await changeInput("secret", "super");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    const submittedValues = onSubmit.mock.calls[0][0];
    expect(submittedValues).toEqual({
      login_attributes: {
        type: "insect",
        personal: "super",
      },
    });
  });

  it("should not save a user attribute with the same key and value as a tenant attribute", async () => {
    const { onSubmit } = setup();

    await screen.findByText("Attributes");
    await changeInput("insect", "bug");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    const submittedValues = onSubmit.mock.calls[0][0];
    expect(submittedValues).toEqual({
      login_attributes: {
        personal: "secret",
      },
    });
  });
});
