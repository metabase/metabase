import {
  ARTIFACT_DND_MIME,
  isArtifactDrag,
  readArtifactDragData,
  setArtifactDragData,
} from "./artifactDragData";

function createMockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
  };
  // a real DataTransfer has many members we don't exercise; this fake covers
  // the read/write surface our helpers use.
  return dt as unknown as DataTransfer;
}

describe("artifactDragData", () => {
  it("round-trips an artifact payload through the custom MIME type", () => {
    const dt = createMockDataTransfer();
    setArtifactDragData(dt, { model: "card", id: 22 });

    expect(dt.effectAllowed).toBe("copy");
    expect(dt.getData("text/plain")).toBe("/question/22");
    expect(isArtifactDrag(dt)).toBe(true);
    expect(readArtifactDragData(dt)).toEqual({ model: "card", id: 22 });
  });

  it("returns null when the custom MIME type is absent", () => {
    const dt = createMockDataTransfer();
    dt.setData("text/plain", "/question/22");

    expect(isArtifactDrag(dt)).toBe(false);
    expect(readArtifactDragData(dt)).toBeNull();
  });

  it("returns null for a malformed payload", () => {
    const dt = createMockDataTransfer();
    dt.setData(ARTIFACT_DND_MIME, "{not json");

    expect(readArtifactDragData(dt)).toBeNull();
  });

  it("returns null when reading from a null dataTransfer", () => {
    expect(isArtifactDrag(null)).toBe(false);
    expect(readArtifactDragData(null)).toBeNull();
  });
});
