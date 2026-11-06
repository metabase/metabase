import { render } from "@testing-library/react";
import { useContext, useEffect } from "react";

import {
  DashboardAutoHeight,
  DashboardAutoHeightContext,
} from "./DashboardAutoHeight";

function ReportHeight({
  content,
  viewport,
}: {
  content: number | null;
  viewport: number;
}) {
  const report = useContext(DashboardAutoHeightContext);
  useEffect(() => {
    report?.(content, viewport);
  }, [report, content, viewport]);
  return null;
}

describe("DashboardAutoHeight", () => {
  afterEach(() => jest.restoreAllMocks());

  it("includes card chrome and stays stable as the viewport grows", () => {
    const clientHeight = jest.spyOn(
      HTMLElement.prototype,
      "clientHeight",
      "get",
    );
    clientHeight.mockReturnValue(300);
    const onHeightChange = jest.fn();
    const { rerender } = render(
      <DashboardAutoHeight id={1} onHeightChange={onHeightChange}>
        <ReportHeight content={600} viewport={250} />
      </DashboardAutoHeight>,
    );
    expect(onHeightChange).toHaveBeenLastCalledWith(1, 650);
    clientHeight.mockReturnValue(650);
    rerender(
      <DashboardAutoHeight id={1} onHeightChange={onHeightChange}>
        <ReportHeight content={600} viewport={600} />
      </DashboardAutoHeight>,
    );
    expect(onHeightChange).toHaveBeenLastCalledWith(1, 650);
    rerender(
      <DashboardAutoHeight id={1} onHeightChange={onHeightChange}>
        <ReportHeight content={null} viewport={600} />
      </DashboardAutoHeight>,
    );
    expect(onHeightChange).toHaveBeenLastCalledWith(1, null);
  });
});
