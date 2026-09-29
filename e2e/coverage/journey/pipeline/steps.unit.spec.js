import { Buffer } from "node:buffer";

import { buildPath } from "./steps.mjs";

const command = (seq, name, chain, phase = "test", fields = {}) => ({
  seq,
  t: seq,
  kind: "command",
  phase,
  url: "/",
  name,
  chain,
  ...fields,
});

// The fields the capture records for a task's argument or a stub's reply, from its canonical text.
const payload = (field, text, hash = "0123456789abcdef") => ({
  [field]: text,
  [`${field}Hash`]: hash,
  [`${field}Bytes`]: Buffer.byteLength(text),
});

describe("buildPath", () => {
  it("should leave the coverage plugin's window() call out of the path in both schemas", () => {
    const events = [
      command(0, "window", "window(<hidden>)", "before each"),
      command(1, "then", "window(<hidden>).then(fn)", "before each"),
      command(2, "window", 'window({"log":false})', "before each"),
      command(3, "visit", 'visit("/question/1")'),
    ];

    expect(buildPath(events).tokens.map((token) => token.exact)).toEqual([
      'visit("/question/1")',
    ]);
  });

  it("should keep a test's own window() call", () => {
    const events = [command(0, "window", 'window().its("location")')];

    expect(buildPath(events).tokens.map((token) => token.exact)).toEqual([
      'window().its("location")',
    ]);
  });
});

describe("buildPath with spec setup", () => {
  const stub = (seq, reply) =>
    command(
      seq,
      "intercept",
      'intercept("GET", "/api/user/current", <reply>)',
      "before each",
      payload("reply", reply),
    );
  const task = (seq, arg) =>
    command(
      seq,
      "task",
      'task("resetTable")',
      "before each",
      payload("arg", arg),
    );

  it("should keep a spec's tasks and hash their argument at the exact level", () => {
    const tokens = buildPath([
      task(0, '{"table":"many_data_types"}'),
      command(1, "then", 'task("resetTable").then(fn)', "before each"),
    ]).tokens;

    expect(tokens.map((token) => token.exact)).toEqual([
      expect.stringMatching(
        /^before each: task\("resetTable"\) arg#[0-9a-f]{16}$/,
      ),
    ]);
    expect(tokens[0].normalized).toBe(
      'before each: task("resetTable") arg {"table":"many_data_types"}',
    );
  });

  it("should tell stubs with different static replies apart at both levels", () => {
    const ldap = buildPath([stub(0, '{"id":1,"sso_source":"ldap"}')]).tokens;
    const google = buildPath([
      stub(0, '{"id":1,"sso_source":"google"}'),
    ]).tokens;

    expect(ldap[0].exact).not.toBe(google[0].exact);
    expect(ldap[0].exact).toMatch(
      /^before each: intercept\("GET", "\/api\/user\/current", <reply>\) reply#[0-9a-f]{16}$/,
    );
    expect(ldap[0].normalized).not.toBe(google[0].normalized);
    expect(ldap[0].normalized).toBe(
      'before each: intercept("GET", "/api/user/current", <reply>) reply {"id":<id>,"sso_source":"ldap"}',
    );
  });

  it("should give stubs with the same reply the same token when run-varying values differ", () => {
    const at = (date) =>
      buildPath([stub(0, `{"id":1,"last_login":"${date}"}`)]).tokens[0].exact;

    expect(at("2026-09-29T10:00:00Z")).toBe(at("2026-09-30T11:30:00Z"));
  });

  it("should mark a clipped reply with the capture's hash and a handler by its type", () => {
    const clipped = command(
      0,
      "intercept",
      'intercept("/api/a", <reply>)',
      "test",
      {
        reply: '{"b":1…',
        replyHash: "fedcba9876543210",
        replyBytes: 5000,
      },
    );
    const handler = command(
      1,
      "intercept",
      'intercept("/api/a", <reply>)',
      "test",
      {
        replyType: "handler",
      },
    );

    expect(
      buildPath([clipped, handler]).tokens.map((token) => token.exact),
    ).toEqual([
      'intercept("/api/a", <reply>) reply#fedcba9876543210~raw',
      'intercept("/api/a", <reply>) reply<handler>',
    ]);
  });
});
