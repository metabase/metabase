export function mockDictationBrowser() {
  const descriptors: Array<{
    target: object;
    key: string;
    descriptor: PropertyDescriptor | undefined;
  }> = [];
  const replace = (target: object, key: string, value: unknown) => {
    descriptors.push({
      target,
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    });
    Object.defineProperty(target, key, { configurable: true, value });
  };
  const track = Object.assign(new EventTarget(), { stop: jest.fn<void, []>() });
  class TestStream {
    getTracks = () => [track];
    getAudioTracks = () => [track];
  }
  replace(window, "MediaStream", TestStream);
  const stream = new MediaStream();
  const getUserMedia = jest
    .fn<Promise<MediaStream>, [MediaStreamConstraints]>()
    .mockResolvedValue(stream);
  class TestRecorder {
    static isTypeSupported = jest.fn((type: string) =>
      type.startsWith("audio/webm"),
    );
    static latest: TestRecorder;
    state: RecordingState = "inactive";
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_stream: MediaStream, options: MediaRecorderOptions) {
      this.mimeType = options.mimeType ?? "audio/webm";
      TestRecorder.latest = this;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({
          data: new Blob(["audio"], { type: this.mimeType }),
        });
        this.onstop?.();
      });
    }
  }
  replace(window, "MediaRecorder", TestRecorder);
  replace(window, "isSecureContext", true);
  replace(navigator, "mediaDevices", { getUserMedia });
  return {
    stream,
    track,
    getUserMedia,
    Recorder: TestRecorder,
    restore: () =>
      descriptors.reverse().forEach(({ target, key, descriptor }) => {
        if (descriptor) {
          Object.defineProperty(target, key, descriptor);
        } else {
          Reflect.deleteProperty(target, key);
        }
      }),
  };
}
