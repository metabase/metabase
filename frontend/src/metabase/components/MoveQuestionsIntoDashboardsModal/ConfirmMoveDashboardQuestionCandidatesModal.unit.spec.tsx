import { render, screen } from "__support__/ui";

import {
  ConfirmMoveDashboardQuestionCandidatesModal,
  type ConfirmMoveDashboardQuestionCandidatesModalProps,
} from "./ConfirmMoveDashboardQuestionCandidatesModal";

const baseProps = {
  candidates: [],
  isMutating: false,
  mutationError: undefined,
  isLoading: false,
  fetchError: undefined,
  onConfirm: () => Promise.resolve(),
  onCancel: () => {},
};

function setup(
  props: Partial<ConfirmMoveDashboardQuestionCandidatesModalProps>,
) {
  render(
    <ConfirmMoveDashboardQuestionCandidatesModal {...baseProps} {...props} />,
  );
}

describe("ConfirmMoveDashboardQuestionCandidatesModal", () => {
  it("should render list if dashboard candidates are found", async () => {
    setup({
      candidates: [
        {
          id: 1,
          name: "Card target",
          description: null,
          sole_dashboard_info: {
            id: 1,
            name: "Dashboard target",
            description: null,
          },
        },
      ],
    });
    expect(await screen.findByText("Card target")).toBeInTheDocument();
    expect(await screen.findByText("Dashboard target")).toBeInTheDocument();
  });

  it("should render empty state if no dashboard candidates found", async () => {
    setup({ candidates: [] });
    const msg =
      "There aren't any questions to move into dashboards. Looks like everything is in its place.";
    expect(await screen.findByText(msg)).toBeInTheDocument();
  });

  it("should render loading state if isLoading is true", async () => {
    setup({ isLoading: true });
    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should list error state if fetchError is present", async () => {
    const errMsg = "failed to fetch list for some reason";
    setup({ fetchError: new Error(errMsg) });
    expect(await screen.findByText(errMsg)).toBeInTheDocument();
  });

  it("should move error state if mutationError is present", async () => {
    const errMsg = "failed to move cards for some reason";
    setup({ mutationError: new Error(errMsg) });
    expect(await screen.findByText(errMsg)).toBeInTheDocument();
  });
});
