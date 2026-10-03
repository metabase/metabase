import { readImageFile } from "./image-file";

const MB = 1024 * 1024;

const mockImageDecoding = (outcome: "load" | "error") =>
  jest
    .spyOn(HTMLImageElement.prototype, "src", "set")
    .mockImplementation(function (this: HTMLImageElement) {
      setTimeout(() => this.dispatchEvent(new Event(outcome)));
    });

describe("readImageFile", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the file as a data URI when it decodes as an image", async () => {
    mockImageDecoding("load");
    const file = new File(["logo"], "logo.png", { type: "image/png" });

    const result = await readImageFile(file);

    expect(result).toEqual({
      status: "success",
      dataUri: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it("rejects a file larger than 2MB", async () => {
    const file = new File([new Uint8Array(2 * MB + 1)], "big.png", {
      type: "image/png",
    });

    expect(await readImageFile(file)).toEqual({
      status: "error",
      message:
        "The image you chose is larger than 2MB. Please choose another one.",
    });
  });

  it("rejects a file that does not decode as an image", async () => {
    mockImageDecoding("error");
    const file = new File(["not an image"], "logo.png", { type: "image/png" });

    expect(await readImageFile(file)).toEqual({
      status: "error",
      message: "The image you chose is corrupted. Please choose another one.",
    });
  });
});
