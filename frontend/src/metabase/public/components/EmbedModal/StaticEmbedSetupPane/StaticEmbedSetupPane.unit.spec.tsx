import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCard,
  createMockDashboard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { getBrokenUpTextMatcher, renderWithProviders } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";
import * as whitelabelSelectors from "metabase/selectors/whitelabel";

import type { StaticEmbedSetupPaneProps } from "./StaticEmbedSetupPane";
import { StaticEmbedSetupPane } from "./StaticEmbedSetupPane";

const TextEditorMock = ({
  value,
  highlightedText,
}: {
  value: string;
  highlightedText?: string[];
}) => (
  <div data-testid="text-editor-mock">
    {value}
    {highlightedText && (
      <div data-testid="text-editor-mock-highlighted-code">
        {highlightedText.map(text => text)}
      </div>
    )}
  </div>
);

jest.mock("metabase/components/TextEditor", () => TextEditorMock);

const FONTS_MOCK_VALUES = [
  "My Awesome Font",
  "Some Font 2",
  "And Another Third Font",
];

describe("Static Embed Setup phase", () => {
  describe("EmbedModalContentStatusBar", () => {
    it.each([
      {
        resourceType: "dashboard" as const,
      },
      {
        resourceType: "question" as const,
      },
    ])(
      "should render actions banner for non-published $resourceType",
      ({ resourceType }) => {
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
      },
    );

    it.each([
      {
        resourceType: "dashboard" as const,
        resource: createMockDashboard({
          enable_embedding: true,
        }),
      },
      {
        resourceType: "question" as const,
        resource: createMockCard({
          enable_embedding: true,
        }),
      },
    ])(
      "should render actions banner for published $resourceType",
      ({ resourceType, resource }) => {
        const { onUpdateEnableEmbedding } = setup({
          props: {
            resource,
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
      },
    );
  });

  describe("Overview tab", () => {
    it("should render content", () => {
      setup({
        props: {},
        activeTab: "Overview",
      });

      expect(screen.getByText("Setting up a static embed")).toBeVisible();

      const link = screen.getByRole("link", {
        name: "documentation",
      });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/embedding/static-embedding.html",
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

    it("should select proper client code language on server code option change", async () => {
      setup({
        props: {},
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
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Parameters",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { dashboard: 1 }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`,
      );
    });

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
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
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

      const parametersSection = screen.getByLabelText("Configuring parameters");
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
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");
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
      expect(screen.getByLabelText("My param")).toHaveTextContent("Disabled");

      userEvent.click(screen.getByLabelText("My param"));

      userEvent.click(screen.getByText("Locked"));

      userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

      await waitFor(() =>
        expect(onUpdateEmbeddingParams).toHaveBeenCalledWith({
          my_param: "locked",
        }),
      );
    });

    it("should render preview iframe in Preview mode", () => {
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Parameters",
      });

      userEvent.click(screen.getByText("Preview"));

      expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
    });

    it("should highlight changed code on parameters change", () => {
      const dashboard = createMockDashboard();
      const dateParameter = {
        id: "5cd742ef",
        name: "Month and Year",
        slug: "month_and_year",
        type: "date/month-year",
      };

      setup({
        props: {
          resource: dashboard,
          resourceParameters: [dateParameter],
        },
        activeTab: "Parameters",
      });

      userEvent.click(screen.getByLabelText(dateParameter.name));

      userEvent.click(screen.getByText("Locked"));

      expect(
        screen.getByText(
          "In addition to publishing changes, update the params in the payload, like this:",
        ),
      ).toBeVisible();

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `params: { "${dateParameter.slug}": null }`,
      );
    });

    it("should switch to Preview mode if user changes locked parameter value", () => {
      setup({
        props: {
          resource: {
            ...createMockDashboard(),
            embedding_params: {
              month_and_year: "locked",
            },
          },
          resourceParameters: [
            {
              id: "5cd742ef",
              name: "Month and Year",
              slug: "month_and_year",
              type: "date/month-year",
            },
          ],
        },
        activeTab: "Parameters",
      });

      userEvent.click(
        within(screen.getByLabelText("Previewing locked parameters")).getByRole(
          "button",
          { name: "Month and Year" },
        ),
      );

      userEvent.click(screen.getByText("February"));

      expect(screen.getByLabelText("Preview")).toBeChecked();
      expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
    });
  });

  describe("Appearance tab", () => {
    it("should render Code mode by default", () => {
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Appearance",
      });

      expect(screen.getByLabelText("Code")).toBeChecked();

      expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
        `// you will need to install via 'npm install jsonwebtoken' or in your package.json var jwt = require("jsonwebtoken"); var METABASE_SITE_URL = "http://localhost:3000"; var METABASE_SECRET_KEY = "my_super_secret_key"; var payload = { resource: { dashboard: 1 }, params: {}, exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration }; var token = jwt.sign(payload, METABASE_SECRET_KEY); var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`,
      );
    });

    it("should render preview iframe in Preview mode", () => {
      const dashboard = createMockDashboard();
      setup({
        props: {
          resource: dashboard,
        },
        activeTab: "Appearance",
      });

      userEvent.click(screen.getByText("Preview"));

      expect(screen.getByTestId("embed-preview-iframe")).toBeVisible();
    });

    it("should highlight changed code on settings change", () => {
      setup({
        props: {
          resource: createMockDashboard(),
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

    describe("OSS version", () => {
      it("should not render Font selector", () => {
        setup({
          props: {},
          activeTab: "Appearance",
        });

        expect(
          screen.getByText(
            getBrokenUpTextMatcher("You can change the font with a paid plan."),
          ),
        ).toBeVisible();
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
      });
    });

    describe("EE version", () => {
      beforeAll(() => {
        jest
          .spyOn(whitelabelSelectors, "getCanWhitelabel")
          .mockImplementation((_state: any) => true);
      });

      afterAll(() => {
        jest.resetAllMocks();
      });

      it("should render Font selector", async () => {
        setup({
          props: {},
          activeTab: "Appearance",
          isEE: true,
        });

        const fontSelect = screen.getByLabelText("Font");
        expect(fontSelect).toBeVisible();

        userEvent.click(fontSelect);

        const popover = await screen.findByRole("grid");

        FONTS_MOCK_VALUES.forEach(fontName => {
          expect(within(popover).getByText(fontName)).toBeVisible();
        });

        userEvent.click(within(popover).getByText(FONTS_MOCK_VALUES[0]));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `font=${encodeURIComponent(FONTS_MOCK_VALUES[0])}`,
        );
      });

      it('should not render "Powered by Metabase" banner caption', async () => {
        setup({
          props: {},
          activeTab: "Appearance",
          isEE: true,
        });

        expect(
          screen.queryByText("Removing the “Powered by Metabase” banner"),
        ).not.toBeInTheDocument();
      });

      it('should render "Download data" control for questions', () => {
        setup({
          props: {
            resource: createMockCard({
              enable_embedding: true,
            }),
            resourceType: "question",
          },
          activeTab: "Appearance",
          isEE: true,
        });

        expect(screen.getByText("Download data")).toBeVisible();
        expect(
          screen.getByLabelText(
            "Enable users to download data from this embed",
          ),
        ).toBeChecked();

        userEvent.click(
          screen.getByText("Enable users to download data from this embed"),
        );

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `hide_download_button=true`,
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
    const dateParameter = {
      id: "5cd742ef",
      name: "Month and Year",
      slug: "month_and_year",
      type: "date/month-year",
    };
    setup({
      props: {
        resource: createMockDashboard(),
        resourceParameters: [dateParameter],
      },
      activeTab: "Parameters",
    });

    userEvent.click(screen.getByLabelText(dateParameter.name));

    userEvent.click(screen.getByText("Locked"));

    const parametersChangedCode = `params: { "${dateParameter.slug}": null }`;

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
    ).toHaveTextContent(`params: { "${dateParameter.slug}": null }`);

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
      screen.getByTestId("text-editor-mock-highlighted-code"),
    ).toHaveTextContent(`${parametersChangedCode},${appearanceChangedCode}`);
  });
});

function setup(
  {
    props: {
      resource = createMockDashboard(),
      resourceType = "dashboard",
      resourceParameters = [],
      onUpdateEmbeddingParams = jest.fn(),
      onUpdateEnableEmbedding = jest.fn(),
    },
    activeTab = "Overview",
    isEE = false,
  }: {
    props: Partial<StaticEmbedSetupPaneProps>;
    activeTab?: "Overview" | "Parameters" | "Appearance";
    isEE?: boolean;
  } = {
    props: {},
  },
) {
  const view = renderWithProviders(
    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings: createMockSettingsState({
          "enable-embedding": true,
          "embedding-secret-key": "my_super_secret_key",
          "token-features": isEE
            ? createMockTokenFeatures({
                whitelabel: true,
              })
            : undefined,
          "available-fonts": isEE ? FONTS_MOCK_VALUES : undefined,
        }),
      },
    },
  );

  if (activeTab && activeTab !== "Overview") {
    userEvent.click(
      screen.getByRole("tab", {
        name: activeTab,
      }),
    );
  }

  return {
    ...view,
    onUpdateEmbeddingParams,
    onUpdateEnableEmbedding,
  };
}

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
