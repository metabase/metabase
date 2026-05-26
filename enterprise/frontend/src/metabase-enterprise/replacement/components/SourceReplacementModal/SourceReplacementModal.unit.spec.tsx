import { renderWithProviders, screen } from "__support__/ui";
import type { SourceReplacementTriggeredFrom } from "metabase/plugins";

import { SourceReplacementModal } from "./SourceReplacementModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

type SetupOpts = {
  opened?: boolean;
  triggeredFrom?: SourceReplacementTriggeredFrom;
};

function setup({
  opened = true,
  triggeredFrom = "table_list",
}: SetupOpts = {}) {
  renderWithProviders(
    <SourceReplacementModal
      opened={opened}
      triggeredFrom={triggeredFrom}
      onClose={jest.fn()}
    />,
  );
}

describe("SourceReplacementModal analytics", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it.each<SourceReplacementTriggeredFrom>(["table_list", "dependency_graph"])(
    "tracks replace_data_source_started with triggered_from=%s when opened",
    async (triggeredFrom) => {
      setup({ opened: true, triggeredFrom });

      expect(
        await screen.findByText("Find and replace a data source"),
      ).toBeInTheDocument();
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "replace_data_source_started",
        triggered_from: triggeredFrom,
      });
    },
  );

  it("does not track replace_data_source_started while closed", () => {
    setup({ opened: false });
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });
});
