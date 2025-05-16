import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import * as EnterpriseContentTranslationUtilsModule from "metabase-enterprise/content_translation/utils";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import type { Parameter, TokenFeatures } from "metabase-types/api";
import {
  createMockParameter,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

interface SetupOpts {
  connectedField?: Field;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  parameterOpts?: Partial<Parameter>;
  locale?: string;
}

function setup({
  connectedField,
  tokenFeatures = {},
  hasEnterprisePlugins = false,
  parameterOpts = {},
  locale = "en",
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();

    setupContentTranslationEndpoints({
      dictionary: [
        {
          id: 0,
          locale: "de",
          msgid: "Text contains",
          msgstr: "Text enthält",
        },
      ],
    });
  }

  const parameter: FieldFilterUiParameter = {
    ...createMockParameter({
      id: "1fe8ce3",
      type: "string/contains",
      slug: "text_contains",
      name: "Text contains",
      ...parameterOpts,
    }),
    fields: connectedField ? [connectedField] : [],
  };

  const setValue = jest.fn();

  renderWithProviders(
    <ParameterWidget parameter={parameter} setValue={setValue} />,
    { storeInitialState: state },
  );

  return { setValue };
}

describe("Parameter Widget", () => {
  describe("content translation", () => {
    const setupOptions = { locale: "de", parameterOpts: { value: "a" } };

    /** Spying on the translateContentString function lets us figure out
     * whether content translation is actually on. If the function is called,
     * it's on. */
    let translateContentStringSpy: any;

    beforeEach(() => {
      translateContentStringSpy = jest.spyOn(
        EnterpriseContentTranslationUtilsModule,
        "translateContentString",
      );
    });

    afterEach(() => {
      translateContentStringSpy.mockClear();
    });

    it("(OSS) should not translate any content", async () => {
      setup(setupOptions);
      expect(await screen.findByTestId("field-set-legend")).toHaveTextContent(
        "Text contains",
      );
      expect(translateContentStringSpy).not.toHaveBeenCalled();
    });

    it("(EE with token) should translate legend", async () => {
      setup({
        ...setupOptions,
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
      });
      await waitFor(async () => {
        expect(await screen.findByTestId("field-set-legend")).toHaveTextContent(
          "Text enthält",
        );
      });
      expect(translateContentStringSpy).toHaveBeenCalled();
    });
  });
});
