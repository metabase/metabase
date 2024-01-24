import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockDashboard } from "metabase-types/api/mocks";
import { getBrokenUpTextMatcher } from "__support__/ui";

import { getMockResource, setup } from "./setup";

const DATE_PARAMETER_MOCK = {
  id: "5cd742ef",
  name: "Month and Year",
  slug: "month_and_year",
  type: "date/month-year",
};

describe("Static Embed Setup phase", () => {
  describe.each([
    {
      resourceType: "dashboard" as const,
    },
    {
      resourceType: "question" as const,
    },
  ])("$resourceType", ({ resourceType }) => {
    describe("EmbedModalContentStatusBar", () => {
      it(`should render actions banner for non-published ${resourceType}`, () => {
        const { onUpdateEnableEmbedding } = setup({
          props: {
            resourceType,
          },
        });

        expect(
          screen.getByText(
            `You will need to publish this ${resourceType} before you can embed it in another application.`,
          ),
        ).toBeVisible();

        const button = screen.getByRole("button", {
          name: "Publish",
        });
        expect(button).toBeVisible();

        userEvent.click(button);

        expect(onUpdateEnableEmbedding).toHaveBeenLastCalledWith(true);
      });

      it(`should render actions banner for published ${resourceType}`, () => {
        const { onUpdateEnableEmbedding } = setup({
          props: {
            resource: getMockResource(resourceType, true),
            resourceType,
          },
        });

        expect(
          screen.getByText(
            `This ${resourceType} is published and ready to be embedded.`,
          ),
        ).toBeVisible();

        const button = screen.getByRole("button", {
          name: "Unpublish",
        });
        expect(button).toBeVisible();

        userEvent.click(button);

        expect(onUpdateEnableEmbedding).toHaveBeenLastCalledWith(false);
      });
    });

    describe("Overview tab", () => {
      it("should render content", () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Overview",
        });

        expect(screen.getByText("Setting up a static embed")).toBeVisible();

        expect(
          screen.getByText(
            `To embed this ${resourceType} in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.`,
          ),
        ).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=oss&utm_media=static-embed-settings-overview",
        );

        expect(
          screen.getByText(
            "Insert this code snippet in your server code to generate the signed embedding URL",
          ),
        ).toBeVisible();

        expect(
          screen.getByText(
            "Then insert this code snippet in your HTML template or single page app.",
          ),
        ).toBeVisible();
      });

      if (resourceType === "dashboard") {
        it("should render dashboard-specific content", () => {
          setup({
            props: {
              resourceType,
            },
            activeTab: "Overview",
          });

          expect(
            screen.getByText(
              "You can also hide or lock any of the dashboard’s parameters.",
            ),
          ).toBeVisible();
        });
      }

      it("should select proper client code language on server code option change", async () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Overview",
        });

        await selectServerCodeLanguage({
          newLanguage: "Ruby",
        });

        await waitFor(() => {
          expect(
            screen.getByTestId("embed-frontend-select-button"),
          ).toHaveTextContent("ERB");
        });
      });
    });

    describe("Parameters tab", () => {
      it("should render Code preview mode by default", () => {
        setup({
          props: {
            resourceType,
            resource: getMockResource(resourceType),
          },
          activeTab: "Parameters",
        });

        expect(screen.getByLabelText("Code")).toBeChecked();

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { ${resourceType}: 1 }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token + "#bordered=true&titled=true";`,
        );
      });

      it("should render preview iframe in Preview mode", () => {
        setup({
          props: {
            resourceType,
            resource: getMockResource(resourceType),
          },
          activeTab: "Parameters",
        });

        userEvent.click(screen.getByText("Preview"));

        expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
      });

      it("should render message if there are no parameters", () => {
        setup({
          props: {
            resourceType,
            resource: getMockResource(resourceType),
          },
          activeTab: "Parameters",
        });

        expect(
          screen.getByText(
            `This ${resourceType} doesn't have any parameters to configure yet.`,
          ),
        ).toBeVisible();
      });

      if (resourceType === "dashboard") {
        it("should render unsaved parameters", () => {
          setup({
            props: {
              resourceParameters: [
                {
                  id: "my_param",
                  name: "My param",
                  slug: "my_param",
                  type: "category",
                },
              ],
            },
            activeTab: "Parameters",
          });

          expect(screen.getByText("My param")).toBeInTheDocument();
          expect(screen.getByLabelText("My param")).toHaveTextContent(
            "Disabled",
          );
        });

        it("should render saved parameters", () => {
          setup({
            props: {
              resource: {
                ...createMockDashboard(),
                embedding_params: {
                  my_param: "locked",
                },
              },
              resourceParameters: [
                {
                  id: "my_param",
                  name: "My param",
                  slug: "my_param",
                  type: "category",
                },
              ],
            },
            activeTab: "Parameters",
          });

          const parametersSection = screen.getByLabelText(
            "Configuring parameters",
          );
          expect(
            within(parametersSection).getByText("My param"),
          ).toBeInTheDocument();
          expect(
            within(parametersSection).getByLabelText("My param"),
          ).toHaveTextContent("Locked");
        });

        it("should only render valid parameters", () => {
          setup({
            props: {
              resource: {
                ...createMockDashboard(),
                embedding_params: {
                  old_param: "locked",
                },
              },
              resourceParameters: [
                {
                  id: "my_param",
                  name: "My param",
                  slug: "my_param",
                  type: "category",
                },
              ],
            },
            activeTab: "Parameters",
          });

          expect(screen.getByText("My param")).toBeInTheDocument();
          expect(screen.getByLabelText("My param")).toHaveTextContent(
            "Disabled",
          );
        });

        it("should update a card with only valid parameters", async () => {
          const { onUpdateEmbeddingParams } = setup({
            props: {
              resource: {
                ...createMockDashboard(),
                enable_embedding: true,
                embedding_params: {
                  old_param: "locked",
                },
              },
              resourceParameters: [
                {
                  id: "my_param",
                  name: "My param",
                  slug: "my_param",
                  type: "category",
                },
              ],
            },
            activeTab: "Parameters",
          });

          expect(screen.getByText("My param")).toBeInTheDocument();
          expect(screen.getByLabelText("My param")).toHaveTextContent(
            "Disabled",
          );

          userEvent.click(screen.getByLabelText("My param"));

          userEvent.click(screen.getByText("Locked"));

          userEvent.click(
            screen.getByRole("button", { name: "Publish changes" }),
          );

          await waitFor(() =>
            expect(onUpdateEmbeddingParams).toHaveBeenCalledWith({
              my_param: "locked",
            }),
          );
        });

        it("should highlight changed code on parameters change", () => {
          setup({
            props: {
              resourceType,
              resource: getMockResource(resourceType),
              resourceParameters: [DATE_PARAMETER_MOCK],
            },
            activeTab: "Parameters",
          });

          userEvent.click(screen.getByLabelText(DATE_PARAMETER_MOCK.name));

          userEvent.click(screen.getByText("Locked"));

          expect(
            screen.getByText(
              "In addition to publishing changes, update the params in the payload, like this:",
            ),
          ).toBeVisible();

          expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
            `params: { "${DATE_PARAMETER_MOCK.slug}": null }`,
          );
        });

        it("should highlight changed code on locked parameter value change", () => {
          setup({
            props: {
              resourceType,
              resource: {
                ...createMockDashboard(),
                embedding_params: {
                  month_and_year: "locked",
                },
              },
              resourceParameters: [DATE_PARAMETER_MOCK],
            },
            activeTab: "Parameters",
          });

          userEvent.click(
            within(
              screen.getByLabelText("Previewing locked parameters"),
            ).getByRole("button", { name: DATE_PARAMETER_MOCK.name }),
          );

          userEvent.click(screen.getByText("February"));

          userEvent.click(screen.getByText("Code"));

          expect(
            screen.getByTestId("text-editor-mock-highlighted-code"),
          ).toHaveTextContent(
            `params: { "${
              DATE_PARAMETER_MOCK.slug
            }": "${new Date().getFullYear()}-02" }`,
          );
        });
      }
    });

    describe("Appearance tab", () => {
      it("should render link to documentation", () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
        });

        expect(
          screen.getByText("Customizing your embed’s appearance"),
        ).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=oss&utm_media=static-embed-settings-appearance#customizing-the-appearance-of-static-embeds",
        );
      });

      it("should render Code mode by default", () => {
        const resource = getMockResource(resourceType);
        setup({
          props: {
            resourceType,
            resource,
          },
          activeTab: "Appearance",
        });

        expect(screen.getByLabelText("Code")).toBeChecked();

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { ${resourceType}: ${resource.id} }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token + "#bordered=true&titled=true";`,
        );
      });

      it("should render preview iframe in Preview mode", () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
        });

        userEvent.click(screen.getByText("Preview"));

        expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
      });

      it("should highlight changed code on settings change", () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
        });

        userEvent.click(screen.getByText("Transparent"));

        expect(
          screen.getByText("Here’s the code you’ll need to alter:"),
        ).toBeVisible();

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `"#theme=transparent&bordered=true&titled=true"`,
        );

        userEvent.click(screen.getByText("Dashboard title"));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `"#theme=transparent&bordered=true&titled=false"`,
        );
      });

      it("should not render Font selector", () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
        });

        expect(
          screen.getByText(
            getBrokenUpTextMatcher("You can change the font with a paid plan."),
          ),
        ).toBeVisible();

        const link = within(
          screen.getByLabelText("Playing with appearance options"),
        ).getByRole("link", {
          name: "a paid plan",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/upgrade?utm_media=static-embed-settings-appearance&utm_source=oss",
        );
      });

      it('should render "Powered by Metabase" banner caption', () => {
        setup({
          props: {},
          activeTab: "Appearance",
        });

        expect(
          screen.getByText("Removing the “Powered by Metabase” banner"),
        ).toBeVisible();

        expect(
          screen.getByText(
            getBrokenUpTextMatcher(
              "This banner appears on all static embeds created with the Metabase open source version. You’ll need to upgrade to a paid plan to remove the banner.",
            ),
          ),
        ).toBeVisible();

        const link = within(
          screen.getByLabelText("Removing the “Powered by Metabase” banner"),
        ).getByRole("link", {
          name: "a paid plan",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/upgrade?utm_media=static-embed-settings-appearance&utm_source=oss",
        );
      });
    });
  });

  it("should preserve selected preview mode selection on tabs navigation", () => {
    setup({
      props: {},
      activeTab: "Parameters",
    });

    userEvent.click(screen.getByText("Preview"));

    userEvent.click(
      screen.getByRole("tab", {
        name: "Appearance",
      }),
    );

    expect(
      screen.getByText("Customizing your embed’s appearance"),
    ).toBeVisible();

    expect(screen.getByLabelText("Preview")).toBeChecked();

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

    expect(
      screen.getByText(
        "This dashboard doesn't have any parameters to configure yet.",
      ),
    ).toBeVisible();

    expect(screen.getByLabelText("Preview")).toBeChecked();
  });

  it("should preserve selected code language selection on tabs navigation", async () => {
    setup({
      props: {},
      activeTab: "Overview",
    });

    await selectServerCodeLanguage({
      newLanguage: "Python",
    });

    userEvent.click(
      screen.getByRole("tab", {
        name: "Parameters",
      }),
    );

    expect(screen.getByTestId("embed-backend-select-button")).toHaveTextContent(
      "Python",
    );

    userEvent.click(
      screen.getByRole("tab", {
        name: "Appearance",
      }),
    );

    expect(screen.getByTestId("embed-backend-select-button")).toHaveTextContent(
      "Python",
    );
  });

  it("should preserve highlighted code on tabs navigation", async () => {
    setup({
      props: {
        resource: createMockDashboard(),
        resourceParameters: [DATE_PARAMETER_MOCK],
      },
      activeTab: "Parameters",
    });

    userEvent.click(screen.getByLabelText(DATE_PARAMETER_MOCK.name));

    userEvent.click(screen.getByText("Locked"));

    const parametersChangedCode = `params: { "${DATE_PARAMETER_MOCK.slug}": null }`;

    expect(
      screen.getByTestId("text-editor-mock-highlighted-code"),
    ).toHaveTextContent(parametersChangedCode);

    userEvent.click(
      screen.getByRole("tab", {
        name: "Appearance",
      }),
    );

    expect(
      screen.getByTestId("text-editor-mock-highlighted-code"),
    ).toHaveTextContent(`params: { "${DATE_PARAMETER_MOCK.slug}": null }`);

    userEvent.click(screen.getByText("Transparent"));

    const appearanceChangedCode = `"#theme=transparent&bordered=true&titled=true"`;

    expect(
      screen.getByTestId("text-editor-mock-highlighted-code"),
    ).toHaveTextContent(`${parametersChangedCode},${appearanceChangedCode}`);

    userEvent.click(
      screen.getByRole("tab", {
        name: "Overview",
      }),
    );

    expect(
      within(screen.getByTestId("embed-backend")).getByTestId(
        "text-editor-mock-highlighted-code",
      ),
    ).toHaveTextContent(`${parametersChangedCode},${appearanceChangedCode}`);
  });

  it("should not display changes after parameters reset to initial values", async () => {
    setup({
      props: {
        resource: {
          ...createMockDashboard({
            enable_embedding: true,
          }),
          embedding_params: {
            my_param: "locked",
          },
        },
        resourceParameters: [
          {
            id: "my_param",
            name: "My param",
            slug: "my_param",
            type: "category",
          },
          {
            id: "my_other_param",
            name: "My other param",
            slug: "my_other_param",
            type: "category",
          },
        ],
      },
      activeTab: "Parameters",
    });

    const parametersTypeSection = screen.getByLabelText(
      "Configuring parameters",
    );

    userEvent.click(
      within(parametersTypeSection).getByLabelText("My other param"),
    );

    userEvent.click(
      within(await screen.findByRole("grid")).getByText("Locked"),
    );

    expect(
      screen.getByRole("button", {
        name: "Discard changes",
      }),
    ).toBeVisible();

    userEvent.click(
      within(parametersTypeSection).getByLabelText("My other param"),
    );

    userEvent.click(
      within(await screen.findByRole("grid")).getByText("Disabled"),
    );

    expect(
      screen.queryByRole("button", {
        name: "Discard changes",
      }),
    ).not.toBeInTheDocument();
  });
});

async function selectServerCodeLanguage({
  currentLanguage = "Node.js",
  newLanguage,
}: {
  currentLanguage?: string;
  newLanguage: string;
}) {
  userEvent.click(screen.getByText(currentLanguage));

  userEvent.click(
    within(await screen.findByRole("grid")).getByText(newLanguage),
  );
}
