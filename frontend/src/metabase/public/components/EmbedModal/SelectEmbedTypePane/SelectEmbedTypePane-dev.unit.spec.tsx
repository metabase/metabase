import { composeStories, setProjectAnnotations } from "@storybook/react";
import { render } from "@testing-library/react";

import { screen } from "__support__/ui";

import * as preview from "../../../../../../../.storybook-dev/preview";

import * as stories from "./SelectEmbedTypePane.dev-stories";

const annotations = setProjectAnnotations([preview]);

const { EmbeddingNotAvailableOss } = composeStories(stories);

beforeAll(annotations.beforeAll);

describe("SelectEmbedTypePane", () => {
  it("should render", () => {
    render(<EmbeddingNotAvailableOss />);
    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
  });
});
