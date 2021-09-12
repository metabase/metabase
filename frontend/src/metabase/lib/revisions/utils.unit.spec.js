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

  it("batches two changes in a single message", () => {
    const revision = getRevision({
      before: {
        name: "Orders",
        archived: true,
      },
      after: {
        name: "Orders by Month",
        archived: false,
      },
    });
    expect(getRevisionMessage(revision)).toBe(
      "renamed this to Orders by Month and unarchived this",
    );
  });

  it("batches many changes in a single message", () => {
    const revision = getRevision({
      before: {
        name: "Orders",
        description: null,
        archived: true,
      },
      after: {
        name: "Orders by Month",
        description: "Test",
        archived: false,
      },
    });
    expect(getRevisionMessage(revision)).toBe(
      "renamed this to Orders by Month, added a description and unarchived this",
    );
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

describe("getRevisionMessage | dashboards", () => {
  it("handles added card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2],
      after: [1, 2, 3],
    });
    expect(getRevisionMessage(revision)).toBe("added a card");
  });

  it("handles added multiple cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2],
      after: [1, 2, 3, 4, 5],
    });
    expect(getRevisionMessage(revision)).toBe("added 3 cards");
  });

  it("filters null card values for new card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: null,
      after: [null, null, 1],
    });
    expect(getRevisionMessage(revision)).toBe("added a card");
  });

  it("handles first card added revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: null,
      after: [1],
    });
    expect(getRevisionMessage(revision)).toBe("added a card");
  });

  it("handles removed cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2],
      after: [1],
    });
    expect(getRevisionMessage(revision)).toBe("removed a card");
  });

  it("filters null card values for removed card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [null, 1, 2],
      after: [null, 1],
    });
    expect(getRevisionMessage(revision)).toBe("removed a card");
  });

  it("handles removed cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2, 3],
      after: [1],
    });
    expect(getRevisionMessage(revision)).toBe("removed 2 cards");
  });

  it("handles all cards removed revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2, 3],
      after: null,
    });
    expect(getRevisionMessage(revision)).toBe("removed 3 cards");
  });

  it("handles rearranged cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [1, 2, 3],
      after: [2, 1, 3],
    });
    expect(getRevisionMessage(revision)).toBe("moved cards around");
  });

  it("handles added series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: null }],
      after: [{ series: [4] }],
    });
    expect(getRevisionMessage(revision)).toBe("added series to a question");
  });

  it("handles removed series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: [4] }],
      after: [{ series: null }],
    });
    expect(getRevisionMessage(revision)).toBe("removed series from a question");
  });

  it("handles modified series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: [4, 5] }],
      after: [{ series: [5, 4] }],
    });
    expect(getRevisionMessage(revision)).toBe("modified question's series");
  });
});
