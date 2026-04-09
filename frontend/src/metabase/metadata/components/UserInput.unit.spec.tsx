import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { setupUsersEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UserInput } from "metabase/metadata/components/UserInput";
import { createMockUserListResult } from "metabase-types/api/mocks";

const handleEmailChange = jest.fn();
const handleUserIdChange = jest.fn();

const setup = (props?: Partial<ComponentProps<typeof UserInput>>) => {
  renderWithProviders(
    <UserInput
      email={null}
      userId={null}
      onEmailChange={handleEmailChange}
      onUserIdChange={handleUserIdChange}
      label="Owner"
      {...props}
    />,
  );
};

describe("UserInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    setupUsersEndpoints([
      createMockUserListResult({
        id: 1,
        common_name: "Alice Anderson",
        email: "alice@test.com",
      }),
      createMockUserListResult({
        id: 2,
        common_name: "Bob Builder",
        email: "bob@test.com",
      }),
      createMockUserListResult({
        id: 3,
        common_name: "Charlie Chen",
        email: "charlie@test.com",
      }),
    ]);
  });

  describe("basic component functionality", () => {
    it("should render user list when opened", async () => {
      setup();

      await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));

      expect(
        screen.getByRole("option", { name: /Alice Anderson/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Bob Builder/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Charlie Chen/ }),
      ).toBeInTheDocument();
    });

    it("should call onUserIdChange when selecting a user", async () => {
      setup();

      await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
      await userEvent.click(
        screen.getByRole("option", { name: /Bob Builder/ }),
      );

      expect(handleUserIdChange).toHaveBeenCalledWith(2);
      expect(handleEmailChange).not.toHaveBeenCalled();
    });

    it("should handle email input and call onEmailChange", async () => {
      setup();

      const input = screen.getByRole("textbox", { name: "Owner" });
      await userEvent.type(input, "newuser@test.com");
      await userEvent.click(screen.getByText("newuser@test.com"));

      expect(handleEmailChange).toHaveBeenCalledWith("newuser@test.com");
    });

    it("should call onUserIdChange with 'unknown' when selecting unknown option", async () => {
      setup();

      await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
      await userEvent.click(
        screen.getByRole("option", { name: /Unspecified/ }),
      );

      expect(handleUserIdChange).toHaveBeenCalledWith("unknown");
      expect(handleEmailChange).not.toHaveBeenCalled();
    });

    it("should filter users based on search input", async () => {
      setup();

      const input = screen.getByRole("textbox", { name: "Owner" });
      await userEvent.type(input, "Bob");

      expect(
        screen.queryByRole("option", { name: /Alice Anderson/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Bob Builder/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /Charlie Chen/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("unknownUserLabel prop", () => {
    it("should display custom unknown user label when provided", async () => {
      setup({ userId: "unknown", unknownUserLabel: "No owner" });

      expect(screen.getByRole("textbox", { name: "Owner" })).toHaveValue(
        "No owner",
      );
    });

    it("should display default unknown user label when prop is not provided", async () => {
      setup({ userId: "unknown", unknownUserLabel: undefined });

      expect(screen.getByRole("textbox", { name: "Owner" })).toHaveValue(
        "Unspecified",
      );
    });
  });
});
