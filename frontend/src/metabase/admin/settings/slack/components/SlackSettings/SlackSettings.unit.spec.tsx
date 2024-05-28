import { render, screen, waitFor } from "@testing-library/react";

import SlackSettings from "./SlackSettings";

const SlackSetupMock = () => <div>SlackSetup</div>;
const SlackStatusMock = () => <div>SlackStatus</div>;

jest.mock("../../containers/SlackSetup", () => SlackSetupMock);
jest.mock("../../containers/SlackStatus", () => SlackStatusMock);

describe("SlackSettings", () => {
  it("should render the status page when the app is configured", () => {
    const onLoadManifest = jest.fn();

    render(<SlackSettings isApp={true} onLoadManifest={onLoadManifest} />);

    expect(screen.getByText("SlackStatus")).toBeInTheDocument();
    expect(onLoadManifest).not.toHaveBeenCalled();
  });

  it("should render the setup page and load the manifest when the app is not configured", async () => {
    const onLoadManifest = jest.fn().mockResolvedValue({ payload: "manifest" });

    render(<SlackSettings isApp={false} onLoadManifest={onLoadManifest} />);

    expect(screen.getByText("SlackSetup")).toBeInTheDocument();
    await waitFor(() => expect(onLoadManifest).toHaveBeenCalled());
  });
});
