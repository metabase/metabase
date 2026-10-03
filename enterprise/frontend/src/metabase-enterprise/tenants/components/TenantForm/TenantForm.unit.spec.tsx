import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { readImageFile } from "metabase-enterprise/whitelabel/lib/image-file";
import type { Tenant } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { TenantForm } from "./TenantForm";

jest.mock("metabase-enterprise/whitelabel/lib/image-file", () => ({
  ...jest.requireActual("metabase-enterprise/whitelabel/lib/image-file"),
  readImageFile: jest.fn(),
}));

const LOGO = "data:image/png;base64,bG9nbw==";

const setup = ({
  isWhitelabeled = true,
  initialValues = { id: 1, name: "Acme", slug: "acme" },
}: {
  isWhitelabeled?: boolean;
  initialValues?: Partial<Tenant>;
} = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ whitelabel: isWhitelabeled }),
  });
  setupEnterprisePlugins();

  const onSubmit = jest.fn();
  renderWithProviders(
    <TenantForm
      initialValues={initialValues}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
    />,
    { storeInitialState: createMockState({ settings }) },
  );

  return { onSubmit };
};

const chooseLogoFile = async () => {
  const file = new File(["logo"], "logo.png", { type: "image/png" });
  await userEvent.upload(
    screen.getByTestId("pdf-export-logo-file-input"),
    file,
  );
};

describe("TenantForm PDF export logo", () => {
  afterEach(() => {
    jest.mocked(readImageFile).mockReset();
  });

  it("is hidden without the whitelabel feature", () => {
    setup({ isWhitelabeled: false });

    expect(screen.getByText("Slug for this tenant")).toBeInTheDocument();
    expect(screen.queryByText("Logo in PDF exports")).not.toBeInTheDocument();
  });

  it("is shown with the whitelabel feature", () => {
    setup();

    expect(screen.getByText("Logo in PDF exports")).toBeInTheDocument();
    expect(screen.getByText("No file chosen")).toBeInTheDocument();
  });

  it("submits the chosen image as a data URI", async () => {
    jest
      .mocked(readImageFile)
      .mockResolvedValue({ status: "success", dataUri: LOGO });
    const { onSubmit } = setup();

    await chooseLogoFile();
    expect(await screen.findByAltText("Logo preview")).toHaveAttribute(
      "src",
      LOGO,
    );
    await userEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.lastCall?.[0]).toMatchObject({
      pdf_export_logo: LOGO,
    });
  });

  it("shows why a file was rejected and keeps the current logo", async () => {
    jest.mocked(readImageFile).mockResolvedValue({
      status: "error",
      message: "The image you chose is larger than 2MB.",
    });
    setup({
      initialValues: {
        id: 1,
        name: "Acme",
        slug: "acme",
        pdf_export_logo: LOGO,
      },
    });

    await chooseLogoFile();

    expect(
      await screen.findByText(/The image you chose is larger than 2MB/),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Logo preview")).toHaveAttribute("src", LOGO);
  });

  it("submits null after the logo is removed", async () => {
    const { onSubmit } = setup({
      initialValues: {
        id: 1,
        name: "Acme",
        slug: "acme",
        pdf_export_logo: LOGO,
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.queryByAltText("Logo preview")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.lastCall?.[0]).toMatchObject({
      pdf_export_logo: null,
    });
  });
});
