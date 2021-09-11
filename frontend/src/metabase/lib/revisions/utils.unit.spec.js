import { getRevisionMessage } from "./utils";

function getRevision({
  isCreation = false,
  isReversion = false,
  before = {},
  after = {},
} = {}) {
  return {
    diff: {
      before,
      after,
    },
    is_creation: isCreation,
    is_reversion: isReversion,
  };
}

function getSimpleRevision({ field, before, after, ...rest }) {
  return getRevision({
    ...rest,
    before: {
      [field]: before,
    },
    after: {
      [field]: after,
    },
  });
}

describe("getRevisionMessage | common", () => {
  it("handles initial revision (entity created)", () => {
    const revision = getRevision({ isCreation: true });
    expect(getRevisionMessage(revision)).toBe("created this");
  });

  it("handles reversions", () => {
    const revision = getRevision({ isReversion: true });
    expect(getRevisionMessage(revision)).toBe(
      "reverted to an earlier revision",
    );
  });

  it("handles renames", () => {
    const revision = getSimpleRevision({
      field: "name",
      before: "Orders",
      after: "Orders by Month",
    });
    expect(getRevisionMessage(revision)).toBe(
      "renamed this to Orders by Month",
    );
  });

  it("handles description added", () => {
    const revision = getSimpleRevision({
      field: "description",
      before: null,
      after: "Hello there",
    });
    expect(getRevisionMessage(revision)).toBe("added a description");
  });

  it("handles description change", () => {
    const revision = getSimpleRevision({
      field: "description",
      before: "Hello",
      after: "Hello there",
    });
    expect(getRevisionMessage(revision)).toBe("changed the description");
  });

  it("handles archive revision", () => {
    const revision = getSimpleRevision({
      field: "archived",
      before: false,
      after: true,
    });
    expect(getRevisionMessage(revision)).toBe("archived this");
  });

  it("handles unarchive revision", () => {
    const revision = getSimpleRevision({
      field: "archived",
      before: true,
      after: false,
    });
    expect(getRevisionMessage(revision)).toBe("unarchived this");
  });

  it.todo("handles item move revision (between collections)");
});

describe("getRevisionMessage | questions", () => {
  it("handles query change revision", () => {
    const revision = getSimpleRevision({
      field: "dataset_query",
      before: { "source-table": 1 },
      after: { "source-table": 2 },
    });

    expect(getRevisionMessage(revision)).toBe("edited the question");
  });

  it("handles visualization settings changes revision", () => {
    const revision = getSimpleRevision({
      field: "visualization_settings",
      before: {},
      after: { "table.pivot": true },
    });

    expect(getRevisionMessage(revision)).toBe(
      "changed the visualization settings",
    );
  });
});
