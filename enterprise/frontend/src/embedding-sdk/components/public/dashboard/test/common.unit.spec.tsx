import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import {
  type SetupSdkDashboardProps,
  setup as setupSdkDashboard,
} from "./setup";

type DashboardMode = "static" | "interactive" | "editable";

const setupWithMode = (
  mode: DashboardMode,
  args: SetupSdkDashboardProps = {},
) =>
  setupSdkDashboard({
    mode,
    ...args,
  });

describe("SdkDashboard", () => {
  // Common tests that apply to multiple modes
  describe.each(["static", "interactive", "editable"] as const)(
    "Common tests for %s mode",
    (mode) => {
      it("should render dashboard cards", async () => {
        await setupWithMode(mode);

        expect(screen.getByText("Here is a card title")).toBeInTheDocument();
        expect(screen.getByText("Some card text")).toBeInTheDocument();
      });

      it("should support onLoad, onLoadWithoutCards handlers", async () => {
        const onLoad = jest.fn();
        const onLoadWithoutCards = jest.fn();
        const { dashboard } = await setupWithMode(mode, {
          props: { onLoad, onLoadWithoutCards },
        });

        expect(onLoadWithoutCards).toHaveBeenCalledTimes(1);
        expect(onLoadWithoutCards).toHaveBeenLastCalledWith(dashboard);

        await waitFor(() => {
          return fetchMock.called(
            `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
          );
        });
        expect(onLoad).toHaveBeenCalledTimes(1);
        expect(onLoad).toHaveBeenLastCalledWith(dashboard);
      });

      it("should support global dashboard load event handlers", async () => {
        const onLoad = jest.fn();
        const onLoadWithoutCards = jest.fn();

        const { dashboard } = await setupWithMode(mode, {
          providerProps: {
            eventHandlers: {
              onDashboardLoad: onLoad,
              onDashboardLoadWithoutCards: onLoadWithoutCards,
            },
          },
        });

        expect(onLoadWithoutCards).toHaveBeenCalledTimes(1);
        expect(onLoadWithoutCards).toHaveBeenLastCalledWith(dashboard);

        await waitFor(() => {
          return fetchMock.called(
            `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
          );
        });

        expect(onLoad).toHaveBeenCalledTimes(1);
        expect(onLoad).toHaveBeenLastCalledWith(dashboard);
      });
    },
  );

  // Test each parameter individually across all three modes
  describe.each(["static", "interactive", "editable"] as const)(
    "SdkDashboard parameters in %s mode",
    (mode) => {
      describe("withTitle parameter", () => {
        it("should show dashboard title when withTitle is true", async () => {
          await setupWithMode(mode, {
            props: { withTitle: true },
          });

          // Check if dashboard title is displayed
          expect(
            screen.getByTestId("dashboard-name-heading"),
          ).toBeInTheDocument();
        });

        it("should hide dashboard title when withTitle is false", async () => {
          await setupWithMode(mode, {
            props: { withTitle: false },
          });

          expect(
            screen.queryByTestId("dashboard-name-heading"),
          ).not.toBeInTheDocument();
        });
      });

      describe("withCardTitle parameter", () => {
        it("should show card titles when withCardTitle is true", async () => {
          await setupWithMode(mode, {
            props: { withCardTitle: true },
          });

          expect(screen.getByText("Here is a card title")).toBeInTheDocument();
        });

        it("should hide card titles when withCardTitle is false", async () => {
          await setupWithMode(mode, {
            props: { withCardTitle: false },
          });

          expect(
            screen.queryByText("Here is a card title"),
          ).not.toBeInTheDocument();
        });
      });

      describe("withDownloads parameter", () => {
        it("should enable downloads when withDownloads is true", async () => {
          await setupWithMode(mode, {
            props: { withDownloads: true },
          });

          expect(screen.getByLabelText("download icon")).toBeInTheDocument();
        });

        it("should disable downloads when withDownloads is false", async () => {
          await setupWithMode(mode, {
            props: { withDownloads: false },
          });

          expect(screen.queryByTestId("download icon")).not.toBeInTheDocument();
        });
      });

      describe("withMetabot parameter", () => {
        it("should show metabot options when withMetabot is true", async () => {
          await setupWithMode(mode, {
            props: { withMetabot: true },
          });

          expect(screen.getByTestId("metabot-button")).toBeInTheDocument();
        });

        it("should hide metabot options when withMetabot is false", async () => {
          await setupWithMode(mode, {
            props: { withMetabot: false },
          });

          expect(
            screen.queryByTestId("metabot-button"),
          ).not.toBeInTheDocument();
        });
      });

      describe("withFooter parameter", () => {
        it("should show the footer when withFooter is true", async () => {
          await setupWithMode(mode, {
            props: { withFooter: true },
          });

          expect(screen.getByTestId("embed-frame-footer")).toBeInTheDocument();
        });

        it("should hide the footer when withFooter is false", async () => {
          await setupWithMode(mode, {
            props: { withFooter: false },
          });

          expect(
            screen.queryByTestId("embed-frame-footer"),
          ).not.toBeInTheDocument();
        });
      });

      describe("hiddenParameters parameter", () => {
        it("should hide specified parameters", async () => {
          await setupWithMode(mode, {
            props: { hiddenParameters: ["title"] },
          });

          // Check that the parameter with slug "title" is not visible
          expect(
            screen.queryByTestId("parameter-title"),
          ).not.toBeInTheDocument();
        });

        it("should show parameters not in hiddenParameters", async () => {
          await setupWithMode(mode, {
            props: { hiddenParameters: [] },
          });

          // Check that the parameter with slug "title" is visible
          expect(screen.getByTestId("parameter-title")).toBeInTheDocument();
        });
      });

      describe("initialParameters parameter", () => {
        it("should apply initial parameter values", async () => {
          const initialParameters = { title: "Test Value" };
          await setupWithMode(mode, {
            props: { initialParameters },
          });

          // Check that the parameter has the initial value
          const parameterInput = screen.getByTestId("parameter-input-title");
          expect(parameterInput).toHaveValue("Test Value");
        });
      });

      describe("drillThroughQuestionHeight parameter", () => {
        it("should set the question height when drilling through", async () => {
          const height = 600;
          await setupWithMode(mode, {
            props: { drillThroughQuestionHeight: height },
          });

          // Click on a card to drill through
          await userEvent.click(screen.getByText("Here is a card title"));

          // Check the height of the drilled-through question container
          const questionContainer =
            await screen.findByTestId("question-container");
          expect(questionContainer).toHaveStyle({ height: `${height}px` });
        });
      });

      describe("plugins parameter", () => {
        it("should apply custom plugins", async () => {
          const customPlugins = {
            dashboard: {
              dashboardCardMenu: {
                withCustomAction: true,
              },
            },
          };

          await setupWithMode(mode, {
            props: { plugins: customPlugins },
          });

          // Trigger the card menu
          await userEvent.click(screen.getByTestId("dashcard-menu-button"));

          // Check for custom action in the menu
          expect(
            screen.getByTestId("custom-action-button"),
          ).toBeInTheDocument();
        });
      });

      describe("onLoad parameter", () => {
        it("should call onLoad handler when dashboard is loaded with cards", async () => {
          const onLoad = jest.fn();
          const { dashboard } = await setupWithMode(mode, {
            props: { onLoad },
          });

          await waitFor(() => {
            return fetchMock.called(
              `path:/api/card/${dashboard.dashcards[0].card_id}/query`,
            );
          });

          expect(onLoad).toHaveBeenCalledTimes(1);
          expect(onLoad).toHaveBeenLastCalledWith(dashboard);
        });
      });

      describe("onLoadWithoutCards parameter", () => {
        it("should call onLoadWithoutCards handler when dashboard is initially loaded", async () => {
          const onLoadWithoutCards = jest.fn();
          const { dashboard } = await setupWithMode(mode, {
            props: { onLoadWithoutCards },
          });

          expect(onLoadWithoutCards).toHaveBeenCalledTimes(1);
          expect(onLoadWithoutCards).toHaveBeenLastCalledWith(dashboard);
        });
      });

      describe("className parameter", () => {
        it("should apply the provided className", async () => {
          await setupWithMode(mode, {
            props: { className: "custom-dashboard-class" },
          });

          const dashboardContainer = screen.getByTestId("dashboard-container");
          expect(dashboardContainer).toHaveClass("custom-dashboard-class");
        });
      });

      describe("style parameter", () => {
        it("should apply the provided style", async () => {
          const customStyle = { backgroundColor: "red" };
          await setupWithMode(mode, {
            props: { style: customStyle },
          });

          const dashboardContainer = screen.getByTestId("dashboard-container");
          expect(dashboardContainer).toHaveStyle(customStyle);
        });
      });

      describe("renderDrillThroughQuestion parameter", () => {
        it("should render custom drill-through component when provided", async () => {
          const CustomDrillThroughComponent = () => (
            <div data-testid="custom-drill-through">Custom Drill Through</div>
          );

          await setupWithMode(mode, {
            props: { renderDrillThroughQuestion: CustomDrillThroughComponent },
          });

          // Click on a card to drill through
          await userEvent.click(screen.getByText("Here is a card title"));

          // Check for the custom component
          expect(
            await screen.findByTestId("custom-drill-through"),
          ).toBeInTheDocument();
        });
      });

      describe("drillThroughQuestionProps parameter", () => {
        it("should pass props to the drill-through question", async () => {
          const drillThroughQuestionProps = {
            title: false,
            height: 800,
          };

          await setupWithMode(mode, {
            props: { drillThroughQuestionProps },
          });

          // Click on a card to drill through
          await userEvent.click(screen.getByText("Here is a card title"));

          // Verify the question title is hidden
          expect(
            screen.queryByTestId("question-title"),
          ).not.toBeInTheDocument();

          // Verify the height is applied
          const questionContainer =
            await screen.findByTestId("question-container");
          expect(questionContainer).toHaveStyle({ height: "800px" });
        });
      });
    },
  );
});
