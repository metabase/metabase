import { renderWithProviders, screen } from "__support__/ui";
import type { EmbeddingEntityType } from "metabase/embedding-sdk/store";
import * as domUtils from "metabase/lib/dom";
import {
  createMockEmbedOptions,
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

import { BrowseNavSection } from "./BrowseNavSection";

describe("BrowseNavSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render Models, Databases, and Metrics when not embedding in iframe", () => {
    setup();

    expect(
      screen.getByRole("listitem", { name: "Browse models" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Browse databases" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Browse metrics" }),
    ).toBeInTheDocument();
  });

  describe("interactive embedding with `entity_types` (EMB-229)", () => {
    it("should show models and tables when no `entity_types` is provided", () => {
      setup({ isEmbeddingIframe: true });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show models and tables when `entity_types` is `["model", "table"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["model", "table"] });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show only models when `entity_types` is `["model"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["model"] });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse databases" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show only tables when `entity_types` is `["table"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["table"] });

      expect(
        screen.queryByRole("listitem", { name: "Browse models" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });
  });
});

interface SetupOpts {
  isEmbeddingIframe?: boolean;
  entityTypes?: EmbeddingEntityType[];
}

function setup({ isEmbeddingIframe, entityTypes }: SetupOpts = {}) {
  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  renderWithProviders(
    <BrowseNavSection
      hasDataAccess
      /**
       * This prop is required, and this value is grabbed directly from React devtools.
       * I'm not going to dive into why it has to be this value, or why it's needed.
       *
       * From my testing, this doesn't seem to render anything in addition to
       * the 3 items `BrowseNavSection` already renders as a base.
       */
      nonEntityItem={{ type: "non-entity", url: "/" }}
      onItemSelect={jest.fn()}
    />,

    entityTypes
      ? {
          storeInitialState: createMockState({
            embed: createMockEmbedState({
              options: createMockEmbedOptions({
                entity_types: entityTypes,
              }),
            }),
          }),
        }
      : undefined,
  );
}
