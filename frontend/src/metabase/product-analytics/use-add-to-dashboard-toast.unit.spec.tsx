import userEvent from "@testing-library/user-event";

import { renderRoutes, screen } from "__support__/ui";
import { useNavigate } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

import {
  JUST_CREATED_STATE,
  useAddToDashboardToast,
} from "./use-add-to-dashboard-toast";

const NewAnalysis = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() =>
        navigate("/product-analysis/1", {
          replace: true,
          state: JUST_CREATED_STATE,
        })
      }
    >
      Create
    </button>
  );
};

const SavedAnalysis = () => {
  const { isPickerOpen } = useAddToDashboardToast();
  return <div>{isPickerOpen ? "Picker open" : "Picker closed"}</div>;
};

const setup = ({ initialRoute }: { initialRoute: string }) => {
  const { router } = renderRoutes(
    [
      { path: "/product-analysis/new", element: <NewAnalysis /> },
      { path: "/product-analysis/:cardId", element: <SavedAnalysis /> },
    ],
    { initialRoute, withUndos: true },
  );
  return { getLocation: () => checkNotNull(router).location };
};

describe("useAddToDashboardToast", () => {
  it("offers to add a newly created analysis to a dashboard", async () => {
    const { getLocation } = setup({
      initialRoute: "/product-analysis/new",
    });

    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Picker closed")).toBeInTheDocument();
    expect(getLocation().state).not.toEqual(JUST_CREATED_STATE);

    await userEvent.click(screen.getByText("Add this to a dashboard"));
    expect(screen.getByText("Picker open")).toBeInTheDocument();
  });

  it("doesn't offer it when opening a saved analysis", async () => {
    setup({ initialRoute: "/product-analysis/1" });

    expect(await screen.findByText("Picker closed")).toBeInTheDocument();
    expect(
      screen.queryByText("Add this to a dashboard"),
    ).not.toBeInTheDocument();
  });
});
