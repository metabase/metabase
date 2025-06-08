import { t } from "ttag";

import { setupLocalesEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import { createMockUser } from "metabase-types/api/mocks";

const TEST_USER = createMockUser();

const TestComponent = () => {
  return <div data-testid="test-component">{t`Unsupported action type`}</div>;
};

const setup = async ({
  locale = "en",
  wrapRenderInAct,
}: { locale?: string; wrapRenderInAct?: boolean } = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  return renderWithSDKProviders(<TestComponent />, {
    sdkProviderProps: {
      authConfig: createMockSdkConfig(),
      locale,
    },
    storeInitialState: state,
    wrapRenderInAct,
  });
};

describe("MetabaseProvider", () => {
  it("should initially render with a loader", () => {
    setup({ wrapRenderInAct: false });

    expect(screen.queryByTestId("test-component")).not.toBeInTheDocument();
  });

  it("should render children with 'es' locale", async () => {
    setupLocalesEndpoint("es", {
      headers: {
        language: "es",
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations: {
        "": {
          "Unsupported action type": {
            msgid: "Unsupported action type",
            msgstr: ["Tipo de acción no soportada"],
          },
        },
      },
    });

    await setup({
      locale: "es",
    });

    expect(screen.getByTestId("test-component")).toHaveTextContent(
      "Tipo de acción no soportada",
    );
  });
});
