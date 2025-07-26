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
  personal: "secret",
  session: "abc123",
};

const structuredAttributes: StructuredUserAttributes = {
  personal: {
    // personal attribute
    source: "user",
    frozen: false,
    value: "secret",
  },
  session: {
    source: "jwt",
    frozen: false,
    value: "abc123",
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
        personal: "super",
      },
    });
  });

  it("should not save a user attribute with the same key and value as a JWT attribute", async () => {
    const { onSubmit } = setup();

    await screen.findByText("Attributes");
    await changeInput("abc123", "abc123");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    const submittedValues = onSubmit.mock.calls[0][0];
    expect(submittedValues).toEqual({
      login_attributes: {
        personal: "secret",
      },
    });
  });
});
