import { act, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderHookWithProviders } from "__support__/ui";
import { mockDictationBrowser } from "metabase/metabot/tests/dictation";

import { MAX_DICTATION_MS, useMetabotDictation } from "./use-metabot-dictation";

describe("useMetabotDictation", () => {
  let browser: ReturnType<typeof mockDictationBrowser>;

  beforeEach(() => {
    browser = mockDictationBrowser();
  });

  afterEach(() => {
    browser.restore();
    jest.useRealTimers();
  });

  function setup() {
    const onComplete = jest.fn<void, [string, boolean]>();
    const view = renderHookWithProviders(
      () => useMetabotDictation(onComplete),
      {},
    );
    return { ...view, onComplete };
  }

  it.each([false, true])(
    "transcribes once after stop, with send=%s",
    async (send) => {
      fetchMock.post("path:/api/metabot/dictation", { text: "Find birds" });
      const { result, onComplete } = setup();
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      await act(() => result.current.start());
      expect(result.current.state.status).toBe("recording");
      act(() => {
        result.current.stop(send);
        result.current.stop(send);
      });
      await waitFor(() =>
        expect(onComplete).toHaveBeenCalledWith("Find birds", send),
      );
      expect(
        fetchMock.callHistory.calls("path:/api/metabot/dictation"),
      ).toHaveLength(1);
      expect(browser.track.stop).toHaveBeenCalled();
      expect(result.current.state.status).toBe("idle");
    },
  );

  it("discards canceled recordings without uploading", async () => {
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    act(() => result.current.cancel());
    expect(browser.track.stop).toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      fetchMock.callHistory.calls("path:/api/metabot/dictation"),
    ).toHaveLength(0);
  });

  it("releases a microphone granted after cancellation", async () => {
    let grant: ((stream: MediaStream) => void) | undefined;
    browser.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    const { result } = setup();
    let start: Promise<void>;
    act(() => {
      start = result.current.start();
    });
    expect(result.current.state.status).toBe("requesting");
    act(() => result.current.cancel());
    await act(async () => {
      grant?.(browser.stream);
      await start;
    });
    expect(browser.track.stop).toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });

  it.each([
    ["NotAllowedError", "Microphone access was denied"],
    ["NotFoundError", "No microphone was found"],
    ["NotReadableError", "Your microphone is unavailable"],
  ])("handles %s", async (name, message) => {
    browser.getUserMedia.mockRejectedValue(
      new DOMException("unavailable", name),
    );
    const { result } = setup();
    await act(() => result.current.start());
    expect(result.current.state).toEqual({
      status: "error",
      canRetry: false,
      message: expect.stringContaining(message),
    });
  });

  it("retries a failed Send for review without automatically sending", async () => {
    fetchMock.post(
      "path:/api/metabot/dictation",
      { status: 502, body: { message: "Try again" } },
      { name: "dictation" },
    );
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    act(() => result.current.stop(true));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(onComplete).not.toHaveBeenCalled();
    fetchMock.modifyRoute("dictation", { response: { text: "Find birds" } });
    act(() => result.current.retry());
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith("Find birds", false),
    );
  });

  it("never submits an empty transcript", async () => {
    fetchMock.post("path:/api/metabot/dictation", { text: " " });
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    act(() => result.current.stop(true));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("stops the microphone on unmount", async () => {
    const { result, unmount, onComplete } = setup();
    await act(() => result.current.start());
    unmount();
    expect(browser.track.stop).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("ignores transcription completed after cancellation", async () => {
    let finish: ((response: { text: string }) => void) | undefined;
    fetchMock.post(
      "path:/api/metabot/dictation",
      () =>
        new Promise<{ text: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    act(() => result.current.stop(true));
    await waitFor(() => expect(finish).toBeDefined());
    act(() => result.current.cancel());
    await act(async () => {
      finish?.({ text: "Late transcript" });
    });
    expect(result.current.state.status).toBe("idle");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("records MP4 when WebM is unavailable", async () => {
    browser.Recorder.isTypeSupported.mockImplementation(
      (type) => type === "audio/mp4",
    );
    const { result } = setup();
    await act(() => result.current.start());
    expect(browser.Recorder.latest.mimeType).toBe("audio/mp4");
    act(() => result.current.cancel());
  });

  it("rejects unsupported recording formats before requesting permission", async () => {
    browser.Recorder.isTypeSupported.mockReturnValue(false);
    const { result } = setup();
    await act(() => result.current.start());
    expect(result.current.state).toEqual({
      status: "error",
      canRetry: false,
      message: expect.stringContaining("doesn't support audio recording"),
    });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
  });

  it("stops before the upload size limit and transcribes for review", async () => {
    fetchMock.post("path:/api/metabot/dictation", { text: "Find birds" });
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    act(() => {
      browser.Recorder.latest.ondataavailable?.({
        data: new Blob([new Uint8Array(23_000_000)]),
      });
    });
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith("Find birds", false),
    );
    expect(browser.track.stop).toHaveBeenCalled();
  });

  it("stops at the duration limit and transcribes for review", async () => {
    jest.useFakeTimers();
    fetchMock.post("path:/api/metabot/dictation", { text: "Find birds" });
    const { result, onComplete } = setup();
    await act(() => result.current.start());
    await act(async () => {
      jest.advanceTimersByTime(MAX_DICTATION_MS);
    });
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith("Find birds", false),
    );
    expect(browser.track.stop).toHaveBeenCalled();
  });
});
